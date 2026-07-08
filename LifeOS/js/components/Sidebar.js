import { ref, computed } from 'vue';
import { formatDate } from '../utils.js';

/**
 * Sidebar 共享组件
 * 被所有页面复用，负责：导航、折叠、今日时间轴预览
 * 
 * 为什么做成 Vue 组件而非每个页面复制 HTML？
 * 1. 任何改动（如新增导航项）只需改一处
 * 2. 组件可复用，所有页面保持一致的导航体验
 * 3. Vue 的 props 机制让"当前页面高亮"变得简单（传 activePage prop）
 */

export default {
    name: 'Sidebar',
    
    /**
     * props：父页面传入当前页面 ID，组件据此高亮对应导航项
     * 为什么用 props 而非直接读取 URL？因为 Vue 组件是数据驱动的，
     * 显式传入 props 让组件不依赖全局状态，更易测试和复用。
     */
    props: {
        activePage: {
            type: String,
            default: 'dashboard',
            validator: (value) => [
                'dashboard', 'timeline', 'tasks', 'habits', 
                'review', 'learning', 'characters', 'settings'
            ].includes(value)
        }
    },
    
    setup(props) {
        // 侧边栏折叠状态：从 IndexedDB 读取用户偏好，持久化
        const sidebarCollapsed = ref(false);
        
        // 导航配置：集中管理所有页面入口
        // 为什么用数组而非硬编码 HTML？方便动态增删、排序、权限控制
        const navItems = ref([
            { id: 'dashboard',  name: '仪表盘',  url: 'index.html',      icon: '📊', ariaLabel: '仪表盘' },
            { id: 'timeline',   name: '时间轴',  url: 'timeline.html',   icon: '⏰', ariaLabel: '时间轴' },
            { id: 'tasks',      name: '任务',    url: 'tasks.html',      icon: '📋', ariaLabel: '任务' },
            { id: 'habits',     name: '习惯',    url: 'habits.html',     icon: '✅', ariaLabel: '习惯' },
            { id: 'review',     name: '回顾',    url: 'review.html',     icon: '📝', ariaLabel: '每日回顾' },
            { id: 'learning',   name: '学习',    url: 'learning.html',   icon: '🎓', ariaLabel: '学习日记' },
            { id: 'characters', name: '角色库', url: 'characters.html', icon: '👤', ariaLabel: '角色库' },
            { id: 'settings',   name: '设置',    url: 'settings.html',   icon: '⚙️', ariaLabel: '设置' }
        ]);
        
        // 计算属性：根据 activePage prop 高亮当前导航项
        const activeNavItems = computed(() => {
            return navItems.value.map(item => ({
                ...item,
                active: item.id === props.activePage
            }));
        });
        
        // 今日日期：用于侧边栏预览区域
        const today = computed(() => formatDate(new Date()));
        
        return {
            sidebarCollapsed,
            activeNavItems,
            today
        };
    },
    
    template: `
        <aside class="sidebar" :class="{ 'collapsed': sidebarCollapsed }">
            <!-- 头部：应用标题 + 折叠按钮 -->
            <div class="sidebar-header">
                <h1 class="app-title" v-show="!sidebarCollapsed">LifeOS</h1>
                <span class="app-title-collapsed" v-show="sidebarCollapsed">O</span>
                <button 
                    class="toggle-btn" 
                    @click="sidebarCollapsed = !sidebarCollapsed"
                    :aria-label="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
                >
                    {{ sidebarCollapsed ? '→' : '←' }}
                </button>
            </div>
            
            <!-- 导航区域 -->
            <nav class="sidebar-nav" aria-label="主导航">
                <a 
                    v-for="item in activeNavItems" 
                    :key="item.id"
                    :href="item.url"
                    :class="['nav-item', { 'active': item.active }]"
                    :aria-label="item.ariaLabel"
                    :aria-current="item.active ? 'page' : null"
                >
                    <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
                    <span class="nav-text" v-show="!sidebarCollapsed">{{ item.name }}</span>
                </a>
            </nav>
            
            <!-- 今日时间轴预览（可折叠区域） -->
            <div class="sidebar-timeline" v-show="!sidebarCollapsed">
                <div class="timeline-header">
                    <h3>今日时间轴</h3>
                    <span class="timeline-date">{{ today }}</span>
                </div>
                <div class="timeline-preview">
                    <p class="placeholder">暂无记录</p>
                    <p class="hint">前往时间轴页面添加</p>
                </div>
            </div>
        </aside>
    `
};
