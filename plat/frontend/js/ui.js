import { CONFIG } from './config.js';

export class UI {
    constructor() {
        this.canvas = document.getElementById('experiment-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 设置默认尺寸
        this.defaultWidth = CONFIG.DEFAULT_MAP_WIDTH;
        this.defaultHeight = CONFIG.DEFAULT_MAP_HEIGHT;
        
        this.setupCanvas();
        
        // 缓存DOM元素
        this.elements = {
            currentSignal: document.getElementById('current-signal'),
            minSignal: document.getElementById('min-signal'),
            timeRemaining: document.getElementById('time-remaining'),
            participantCount: document.getElementById('participant-count'),
            participantList: document.getElementById('participant-list'),
            experimentResults: document.getElementById('experiment-results')
        };
        
        // 绑定窗口大小变化事件
        window.addEventListener('resize', () => this.setupCanvas());
    }
    
    setupCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = this.defaultWidth;
        this.canvas.height = this.defaultHeight;
        
        // 计算缩放比例
        this.scale = Math.min(
            this.canvas.width / this.defaultWidth,
            this.canvas.height / this.defaultHeight
        );
    }
    
    clear() {
        this.ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawGrid() {
        this.ctx.strokeStyle = CONFIG.COLORS.GRID;
        this.ctx.lineWidth = 1;
        
        const gridSize = CONFIG.CANVAS.GRID_SIZE;
        
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    drawPlayer(player) {
        const x = player.x;
        const y = player.y;
        const size = player.isCurrentPlayer ? 
            CONFIG.CANVAS.PLAYER_SIZE : 
            CONFIG.CANVAS.OTHER_PLAYER_SIZE;
        
        // 绘制玩家圆圈
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fillStyle = player.isCurrentPlayer ? 
            CONFIG.COLORS.PLAYER : 
            CONFIG.COLORS.OTHER_PLAYER;
        this.ctx.fill();
        
        // 如果是当前玩家，添加高亮边框
        if (player.isCurrentPlayer) {
            this.ctx.strokeStyle = '#f39c12';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        
        // 绘制信号值
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            Math.round(player.signalValue * 100) / 100,
            x,
            y + size + 15
        );
        
        // 绘制玩家名字
        this.ctx.fillText(player.name || '', x, y - size - 5);
    }
    
    drawPerceptionRange(x, y, range) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, range, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(74, 144, 226, 0.1)';
        this.ctx.fill();
    }
    
    drawSignalHeatmap(signalMap) {
        const gridSize = CONFIG.CANVAS.GRID_SIZE;
        const cols = Math.ceil(this.canvas.width / gridSize);
        const rows = Math.ceil(this.canvas.height / gridSize);
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = i * gridSize;
                const y = j * gridSize;
                const signalValue = signalMap.getSignalValue(x, y);
                const normalizedValue = signalMap.normalizeValue(signalValue);
                
                this.ctx.fillStyle = this.getHeatmapColor(normalizedValue);
                this.ctx.fillRect(x, y, gridSize, gridSize);
            }
        }
    }
    
    getHeatmapColor(value) {
        const colors = CONFIG.COLORS.SIGNAL_GRADIENT;
        const index = value * (colors.length - 1);
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        
        if (lowerIndex === upperIndex) {
            return colors[lowerIndex];
        }
        
        const ratio = index - lowerIndex;
        return this.interpolateColor(
            colors[lowerIndex],
            colors[upperIndex],
            ratio
        );
    }
    
    interpolateColor(color1, color2, ratio) {
        const r1 = parseInt(color1.slice(1, 3), 16);
        const g1 = parseInt(color1.slice(3, 5), 16);
        const b1 = parseInt(color1.slice(5, 7), 16);
        
        const r2 = parseInt(color2.slice(1, 3), 16);
        const g2 = parseInt(color2.slice(3, 5), 16);
        const b2 = parseInt(color2.slice(5, 7), 16);
        
        const r = Math.round(r1 + (r2 - r1) * ratio);
        const g = Math.round(g1 + (g2 - g1) * ratio);
        const b = Math.round(b1 + (b2 - b1) * ratio);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    updatePlayerInfo(player) {
        if (this.elements.currentSignal && player.signalValue !== undefined) {
            this.elements.currentSignal.textContent = Math.round(player.signalValue * 100) / 100;
        }
    }
    
    updateTimer(remainingTime) {
        if (this.elements.timeRemaining) {
            const minutes = Math.floor(remainingTime / 60);
            const seconds = Math.floor(remainingTime % 60);
            this.elements.timeRemaining.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    updateParticipantCount(count) {
        if (this.elements.participantCount) {
            this.elements.participantCount.textContent = count;
        }
    }
    
    showExperimentEnd() {
        if (this.elements.experimentResults) {
            document.getElementById('experiment-container').classList.add('hidden');
            this.elements.experimentResults.classList.remove('hidden');
        }
    }
    
    showError(message) {
        alert(message);
    }
} 