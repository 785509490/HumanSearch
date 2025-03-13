class ExperimentCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.participants = new Map();
        this.currentParticipant = null;
        this.perceptionRange = CONFIG.DEFAULT_PERCEPTION_RANGE;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.scale = Math.min(
            this.canvas.width / CONFIG.DEFAULT_MAP_WIDTH,
            this.canvas.height / CONFIG.DEFAULT_MAP_HEIGHT
        );
    }

    setCurrentParticipant(participant) {
        this.currentParticipant = participant;
    }

    updateParticipant(id, data) {
        this.participants.set(id, data);
    }

    removeParticipant(id) {
        this.participants.delete(id);
    }

    clear() {
        this.ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        this.ctx.strokeStyle = CONFIG.COLORS.GRID;
        this.ctx.lineWidth = 1;

        const gridSize = CONFIG.CANVAS.GRID_SIZE * this.scale;

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

    drawParticipant(position, isCurrentParticipant, signalValue) {
        const x = position.x * this.scale;
        const y = position.y * this.scale;
        const size = isCurrentParticipant ? 
            CONFIG.CANVAS.PLAYER_SIZE : 
            CONFIG.CANVAS.OTHER_PLAYER_SIZE;

        // 绘制参与者
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fillStyle = isCurrentParticipant ? 
            CONFIG.COLORS.PLAYER : 
            CONFIG.COLORS.OTHER_PLAYER;
        this.ctx.fill();

        // 绘制信号值
        if (signalValue !== undefined) {
            this.ctx.fillStyle = this.getSignalColor(signalValue);
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                Math.round(signalValue),
                x,
                y + size + 15
            );
        }
    }

    drawPerceptionRange() {
        if (!this.currentParticipant) return;

        const x = this.currentParticipant.position.x * this.scale;
        const y = this.currentParticipant.position.y * this.scale;
        const radius = this.perceptionRange * this.scale;

        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(74, 144, 226, 0.1)';
        this.ctx.fill();
    }

    getSignalColor(value) {
        // 将信号值映射到0-1范围
        const normalizedValue = Math.min(Math.max(value / 100, 0), 1);
        const gradientColors = CONFIG.COLORS.SIGNAL_GRADIENT;
        const index = normalizedValue * (gradientColors.length - 1);
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        
        if (lowerIndex === upperIndex) {
            return gradientColors[lowerIndex];
        }

        const ratio = index - lowerIndex;
        return this.interpolateColor(
            gradientColors[lowerIndex],
            gradientColors[upperIndex],
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

    render() {
        this.clear();
        this.drawGrid();
        this.drawPerceptionRange();

        // 绘制所有参与者
        for (const [id, data] of this.participants) {
            const isCurrentParticipant = this.currentParticipant && id === this.currentParticipant.id;
            const isInRange = this.isInPerceptionRange(data.position);
            
            if (isCurrentParticipant || isInRange) {
                this.drawParticipant(
                    data.position,
                    isCurrentParticipant,
                    data.signalValue
                );
            }
        }
    }

    isInPerceptionRange(position) {
        if (!this.currentParticipant) return false;

        const dx = position.x - this.currentParticipant.position.x;
        const dy = position.y - this.currentParticipant.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= this.perceptionRange;
    }
} 