class Participant {
    constructor(id, name, position) {
        this.id = id;
        this.name = name;
        this.position = position;
        this.signalValue = 0;
        this.movement = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        
        this.setupControls();
    }

    setupControls() {
        // 触摸控制按钮
        const buttons = {
            up: document.getElementById('up'),
            down: document.getElementById('down'),
            left: document.getElementById('left'),
            right: document.getElementById('right')
        };

        for (const [direction, button] of Object.entries(buttons)) {
            if (button) {
                button.addEventListener('mousedown', () => this.movement[direction] = true);
                button.addEventListener('mouseup', () => this.movement[direction] = false);
                button.addEventListener('mouseleave', () => this.movement[direction] = false);
                button.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.movement[direction] = true;
                });
                button.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.movement[direction] = false;
                });
            }
        }
    }

    update() {
        let dx = 0;
        let dy = 0;
        const speed = CONFIG.MOVEMENT_SPEED;

        // 计算水平和垂直方向的移动
        if (this.movement.up) dy -= speed;
        if (this.movement.down) dy += speed;
        if (this.movement.left) dx -= speed;
        if (this.movement.right) dx += speed;

        // 对角线移动时保持相同速度
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / length) * speed;
            dy = (dy / length) * speed;
        }

        // 更新位置
        const newX = this.position.x + dx;
        const newY = this.position.y + dy;

        // 确保在地图范围内
        this.position.x = Math.max(0, Math.min(newX, CONFIG.DEFAULT_MAP_WIDTH));
        this.position.y = Math.max(0, Math.min(newY, CONFIG.DEFAULT_MAP_HEIGHT));

        return dx !== 0 || dy !== 0;
    }

    setSignalValue(value) {
        this.signalValue = value;
        document.getElementById('current-signal').textContent = Math.round(value);
    }

    getPosition() {
        return { ...this.position };
    }
} 