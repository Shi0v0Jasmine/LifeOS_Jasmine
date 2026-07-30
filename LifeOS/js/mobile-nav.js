/* ============================================================
 * LifeOS 移动端导航（mobile-nav.js）
 *
 * 背景：屏幕宽度 ≤768px 时，CSS 会把侧边栏 translateX(-100%) 隐藏，
 * 但各页面原本没有提供打开它的入口（汉堡按钮），导致手机上完全无法导航。
 *
 * 本脚本以纯 JS（无框架、IIFE）注入：
 *   1. 左上角悬浮汉堡按钮（仅 ≤768px 时由 CSS 显示）
 *   2. 半透明遮罩层
 * 点击按钮切换侧边栏 .open；点击遮罩或任意导航项后自动关闭。
 *
 * 为什么不在 8 个页面的内联 Sidebar 组件里改？
 * 侧边栏是每页内联定义的 Vue 组件，改 8 处模板难以维护；
 * 本脚本在 DOM 层操作（点击时才查询 aside.sidebar），
 * 与 Vue 渲染时序解耦，一处新增、全站生效。
 * ============================================================ */
(function () {
    'use strict';

    var BTN_ID = 'mobile-nav-btn';
    var OVERLAY_ID = 'mobile-nav-overlay';

    function getSidebar() {
        return document.querySelector('aside.sidebar');
    }

    function isOpen(sidebar) {
        return sidebar && sidebar.classList.contains('open');
    }

    function openNav() {
        var sidebar = getSidebar();
        var overlay = document.getElementById(OVERLAY_ID);
        var btn = document.getElementById(BTN_ID);
        if (!sidebar || !overlay) return;
        sidebar.classList.add('open');
        overlay.classList.add('visible');
        if (btn) {
            btn.classList.add('open');
            btn.textContent = '✕';
            btn.setAttribute('aria-label', '关闭导航菜单');
        }
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    function closeNav() {
        var sidebar = getSidebar();
        var overlay = document.getElementById(OVERLAY_ID);
        var btn = document.getElementById(BTN_ID);
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('visible');
        if (btn) {
            btn.classList.remove('open');
            btn.textContent = '☰';
            btn.setAttribute('aria-label', '打开导航菜单');
        }
        document.body.style.overflow = '';
    }

    function toggleNav() {
        if (isOpen(getSidebar())) { closeNav(); } else { openNav(); }
    }

    function inject() {
        if (document.getElementById(BTN_ID)) return; // 幂等

        injectNutritionLink();

        var btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.setAttribute('aria-label', '打开导航菜单');
        btn.textContent = '☰';
        btn.addEventListener('click', toggleNav);

        var overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.addEventListener('click', closeNav);

        document.body.appendChild(overlay);
        document.body.appendChild(btn);

        // 点击任意导航链接后自动收起（跳转前收起，避免新页面残留状态）
        document.addEventListener('click', function (e) {
            var item = e.target.closest && e.target.closest('.sidebar .nav-item');
            if (item) closeNav();
        });

        // 窗口拉宽回桌面尺寸时清理状态
        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) closeNav();
        });

        injectTabBar();
    }

    /*
     * AI 饮食是独立工作台：桌面侧栏保持全站可达。
     * 移动端仍保留原 8 个高频 Tab，AI 饮食通过汉堡菜单进入，避免底栏过载。
     */
    function injectNutritionLink() {
        var nav = document.querySelector('.sidebar-nav');
        if (!nav || nav.querySelector('a[href="nutrition.html"]')) return;

        var page = currentPage();
        var link = document.createElement('a');
        link.href = 'nutrition.html';
        link.className = 'nav-item' + (page === 'nutrition.html' ? ' active' : '');
        link.setAttribute('data-nav-id', 'nutrition');
        link.innerHTML = '<span class="nav-icon" aria-hidden="true">🥗</span><span class="nav-label">AI 饮食</span>';

        var habits = nav.querySelector('a[href="habits.html"]');
        if (habits && habits.nextSibling) {
            nav.insertBefore(link, habits.nextSibling);
        } else if (habits) {
            nav.appendChild(link);
        } else {
            nav.appendChild(link);
        }
    }

    /* v4.2.0 M1：底部 Tab Bar（仅 ≤768px 由 CSS 显示，桌面端不影响） */
    var TAB_ITEMS = [
        { url: 'index.html',      icon: '📊', name: '仪表盘' },
        { url: 'timeline.html',   icon: '⏰', name: '时间轴' },
        { url: 'tasks.html',      icon: '📋', name: '任务' },
        { url: 'habits.html',     icon: '✅', name: '习惯' },
        { url: 'review.html',     icon: '📝', name: '回顾' },
        { url: 'learning.html',   icon: '🎓', name: '学习' },
        { url: 'characters.html', icon: '👤', name: '角色' },
        { url: 'settings.html',   icon: '⚙️', name: '设置' }
    ];

    function currentPage() {
        var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        return file === '' ? 'index.html' : file;
    }

    function injectTabBar() {
        if (document.getElementById('mobile-tab-bar')) return; // 幂等
        var page = currentPage();
        var bar = document.createElement('nav');
        bar.id = 'mobile-tab-bar';
        bar.setAttribute('aria-label', '底部导航');
        TAB_ITEMS.forEach(function (item) {
            var a = document.createElement('a');
            a.href = item.url;
            a.className = 'tab-item' + (item.url === page ? ' active' : '');
            a.innerHTML = '<span class="tab-icon" aria-hidden="true">' + item.icon + '</span>' +
                          '<span class="tab-name">' + item.name + '</span>';
            bar.appendChild(a);
        });
        document.body.appendChild(bar);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
