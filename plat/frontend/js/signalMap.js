export class SignalMap {
    constructor(width, height, type = 'default', params = {}) {
        this.width = width;
        this.height = height;
        this.type = type;
        this.params = params;
        
        // 缓存网格数据以提高性能
        this.gridSize = 20;
        this.gridData = this.generateGridData();
        
        // 存储最小信号值
        this.minSignalValue = Infinity;
        this.updateMinSignalValue();

        console.log('信号地图初始化完成', {
            width: this.width,
            height: this.height,
            type: this.type,
            gridSize: this.gridSize,
            minSignalValue: this.minSignalValue
        });
    }
    
    generateGridData() {
        console.log('生成网格数据');
        const cols = Math.ceil(this.width / this.gridSize);
        const rows = Math.ceil(this.height / this.gridSize);
        const data = new Array(rows);
        
        for (let i = 0; i < rows; i++) {
            data[i] = new Array(cols);
            for (let j = 0; j < cols; j++) {
                const x = j * this.gridSize + this.gridSize / 2;
                const y = i * this.gridSize + this.gridSize / 2;
                data[i][j] = this.calculateSignalValue(x, y);
            }
        }
        
        return data;
    }
    
    updateMinSignalValue() {
        let min = Infinity;
        for (const row of this.gridData) {
            for (const value of row) {
                if (value < min) {
                    min = value;
                }
            }
        }
        this.minSignalValue = min;
        document.getElementById('min-signal').textContent = 
            Math.round(this.minSignalValue * 100) / 100;
    }
    
    getSignalValue(x, y) {
        // 对于任意位置，使用双线性插值获取信号值
        const gridX = Math.floor(x / this.gridSize);
        const gridY = Math.floor(y / this.gridSize);
        
        // 确保坐标在范围内
        const maxGridX = Math.ceil(this.width / this.gridSize) - 1;
        const maxGridY = Math.ceil(this.height / this.gridSize) - 1;
        
        const safeGridX = Math.min(Math.max(0, gridX), maxGridX);
        const safeGridY = Math.min(Math.max(0, gridY), maxGridY);
        
        const value = this.gridData[safeGridY][safeGridX];
        return value;
    }
    
    calculateSignalValue(x, y) {
        // 使用多峰函数作为默认信号函数
        const peaks = [
            { x: this.width * 0.3, y: this.height * 0.3, strength: 0.8 },
            { x: this.width * 0.7, y: this.height * 0.7, strength: 1.0 },
            { x: this.width * 0.3, y: this.height * 0.7, strength: 0.6 }
        ];
        
        let value = 0;
        for (const peak of peaks) {
            const dx = x - peak.x;
            const dy = y - peak.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            value += peak.strength * Math.exp(-distance / 100);
        }
        
        return 1 - value;
    }
    
    // 获取信号值的范围
    getValueRange() {
        let min = Infinity;
        let max = -Infinity;
        
        for (const row of this.gridData) {
            for (const value of row) {
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
        }
        
        return { min, max };
    }
    
    // 归一化信号值（用于颜色映射）
    normalizeValue(value) {
        const { min, max } = this.getValueRange();
        return (value - min) / (max - min);
    }
} 