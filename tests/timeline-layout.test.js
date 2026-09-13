const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'LifeOS', 'js', 'timeline-layout.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'timeline-layout.js' });
const Layout = sandbox.window.LifeOS.TimelineLayout;

function byId(events, id) {
    return events.find(function (event) { return event.id === id; });
}

function testAdjacentEventsUseFullWidth() {
    const events = Layout.assignOverlapColumns([
        { id: 'walk', title: '遛狗', startTime: '09:00', endTime: '09:20' },
        { id: 'duolingo', title: '多邻国', startTime: '09:20', endTime: '09:50' }
    ]);
    assert.strictEqual(byId(events, 'walk')._totalColumns, 1, '相接的遛狗事件不应被分栏');
    assert.strictEqual(byId(events, 'duolingo')._totalColumns, 1, '相接的多邻国事件不应被分栏');
    assert.strictEqual(byId(events, 'walk')._column, 0);
    assert.strictEqual(byId(events, 'duolingo')._column, 0);
}

function testShortGapKeepsRealGeometry() {
    const walk = Layout.getRenderMetrics({ startTime: '09:00', endTime: '09:05' });
    const duolingo = Layout.getRenderMetrics({ startTime: '09:10', endTime: '09:25' });
    assert.strictEqual(walk.heightSlots, 1 / 6, '5 分钟事件必须按真实高度计算');
    assert.ok(walk.topSlots + walk.heightSlots < duolingo.topSlots, '有间隔的短事件不应在几何上相交');
}

function testRealOverlapUsesSeparateColumns() {
    const events = Layout.assignOverlapColumns([
        { id: 'a', startTime: '09:00', endTime: '09:30' },
        { id: 'b', startTime: '09:10', endTime: '09:40' }
    ]);
    assert.strictEqual(byId(events, 'a')._totalColumns, 2);
    assert.strictEqual(byId(events, 'b')._totalColumns, 2);
    assert.notStrictEqual(byId(events, 'a')._column, byId(events, 'b')._column);
}

function testOvernightSleepUsesWakeDayInterval() {
    const metrics = Layout.getRenderMetrics({ category: 'sleep', sleepOpen: false, startTime: '23:30', endTime: '07:15' });
    assert.strictEqual(metrics.start, 0, '跨天睡眠应从起床日 00:00 开始显示');
    assert.strictEqual(metrics.end, 435);
    assert.strictEqual(metrics.duration, 435);
}

const tests = [
    testAdjacentEventsUseFullWidth,
    testShortGapKeepsRealGeometry,
    testRealOverlapUsesSeparateColumns,
    testOvernightSleepUsesWakeDayInterval
];

for (const test of tests) {
    test();
    console.log(`PASS ${test.name}`);
}
console.log(`\n时间轴布局测试全部通过（${tests.length} 项）✓`);
