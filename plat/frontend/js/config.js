export const CONFIG = {
    // 服务器配置
    SERVER_URL: window.location.hostname === 'localhost' ? 'http://localhost:3000' : `${window.location.protocol}//${window.location.hostname}:3000`,
    
    // 实验参数
    DEFAULT_EXPERIMENT_DURATION: 300000, // 5分钟
    DEFAULT_PERCEPTION_RANGE: 20,
    MAX_PARTICIPANTS: 10,
    
    // 地图尺寸
    DEFAULT_MAP_WIDTH: 800,
    DEFAULT_MAP_HEIGHT: 600,
    
    // 移动参数
    MOVEMENT_SPEED: 0.5, // 每帧移动距离
    UPDATE_INTERVAL: 50, // 位置更新间隔（毫秒）
    
    // 信号函数类型
    SIGNAL_FUNCTIONS: {
        DEFAULT: 'default',
        SINGLE_PEAK: 'singlePeak',
        MULTI_PEAK: 'multiPeak'
    },
    
    // 颜色配置
    COLORS: {
        BACKGROUND: '#f8f9fa',
        GRID: '#e9ecef',
        PLAYER: '#2ecc71',
        OTHER_PLAYER: '#3498db',
        SIGNAL_GRADIENT: [
            '#2ecc71',  // 绿色（最低信号）
            '#f1c40f',  // 黄色
            '#e67e22',  // 橙色
            '#e74c3c'   // 红色（最高信号）
        ]
    },
    
    // Canvas配置
    CANVAS: {
        GRID_SIZE: 20,
        PLAYER_SIZE: 10,
        OTHER_PLAYER_SIZE: 8
    }
};

// 防止配置被修改
Object.freeze(CONFIG); 