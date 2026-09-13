/* ============================================================
 * LifeOS 时间轴布局工具
 *
 * 仅处理渲染用的时间区间和碰撞分栏，不读写任何业务数据。
 * 以独立脚本暴露，供页面与 Node 回归测试共享。
 * ============================================================ */
(function () {
    'use strict';

    function timeToMinutes(value) {
        const parts = String(value || '00:00').split(':');
        const hour = Number(parts[0]) || 0;
        const minute = Number(parts[1]) || 0;
        return hour * 60 + minute;
    }

    function getDisplayInterval(event) {
        const startTime = event && event.startTime || '00:00';
        const endTime = event && event.endTime || startTime;
        const isClosedOvernightSleep = event && event.category === 'sleep' && !event.sleepOpen && startTime > endTime;
        const start = isClosedOvernightSleep ? 0 : timeToMinutes(startTime);
        let end = timeToMinutes(endTime);
        if (!isClosedOvernightSleep && end <= start) end += 24 * 60;
        return { start, end, duration: end - start };
    }

    function getRenderMetrics(event) {
        const interval = getDisplayInterval(event);
        return {
            start: interval.start,
            end: interval.end,
            duration: interval.duration,
            topSlots: interval.start / 30,
            heightSlots: interval.duration / 30
        };
    }

    function assignOverlapColumns(events) {
        if (!Array.isArray(events) || !events.length) return [];
        const sorted = events.map(function (event) {
            const interval = getDisplayInterval(event);
            return Object.assign({}, event, { _start: interval.start, _end: interval.end });
        }).sort(function (a, b) {
            return a._start - b._start || a._end - b._end || String(a.id || '').localeCompare(String(b.id || ''));
        });

        const groups = [];
        let group = [];
        let groupEnd = -1;
        sorted.forEach(function (event) {
            // 区间端点相接不算重叠；只有真实交叉的事件才归入同一碰撞组。
            if (group.length && event._start >= groupEnd) {
                groups.push(group);
                group = [];
                groupEnd = -1;
            }
            group.push(event);
            groupEnd = Math.max(groupEnd, event._end);
        });
        if (group.length) groups.push(group);

        groups.forEach(function (collisionGroup) {
            const laneEnds = [];
            collisionGroup.forEach(function (event) {
                let lane = laneEnds.findIndex(function (laneEnd) { return laneEnd <= event._start; });
                if (lane === -1) {
                    lane = laneEnds.length;
                    laneEnds.push(event._end);
                } else {
                    laneEnds[lane] = event._end;
                }
                event._column = lane;
            });
            collisionGroup.forEach(function (event) {
                event._totalColumns = laneEnds.length;
            });
        });
        return sorted;
    }

    window.LifeOS = window.LifeOS || {};
    window.LifeOS.TimelineLayout = { timeToMinutes, getDisplayInterval, getRenderMetrics, assignOverlapColumns };
})();
