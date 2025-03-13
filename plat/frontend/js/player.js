export class Player {
    constructor(id, name, x, y, color, isSelf = false) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.color = color;
        this.isSelf = isSelf; // 是否为当前用户
        this.signalValue = 0; // 当前位置的信号值
        this.radius = 10; // 玩家圆圈半径
        this.movementHistory = []; // 移动历史记录
    }
    
    // 设置位置
    setPosition(x, y) {
        // 记录移动历史
        this.recordMovement();
        
        // 更新位置
        this.x = x;
        this.y = y;
    }
    
    // 记录移动
    recordMovement() {
        this.movementHistory.push({
            timestamp: Date.now(),
            position: { x: this.x, y: this.y },
            signalValue: this.signalValue
        });
    }
    
    // 获取移动历史
    getMovementHistory() {
        return this.movementHistory;
    }
    
    // 计算与另一个玩家的距离
    distanceTo(otherPlayer) {
        const dx = this.x - otherPlayer.x;
        const dy = this.y - otherPlayer.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
} 