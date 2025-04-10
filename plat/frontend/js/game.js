import { CONFIG } from './config.js';

export class Game {
    constructor(canvas, socket, perceptionRange) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.socket = socket;
        this.perceptionRange = perceptionRange;
        this.isRunning = false;
        this.isAdmin = false;
        
        // 设置画布尺寸
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        // 全局最优点位置（默认值）
        this.globalOptimal = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
        
        // 固定的局部最优点
        this.localOptima = [
            { x: this.canvas.width * 0.2, y: this.canvas.height * 0.3, strength: 0.85 },
            { x: this.canvas.width * 0.8, y: this.canvas.height * 0.3, strength: 0.75 },
            { x: this.canvas.width * 0.3, y: this.canvas.height * 0.8, strength: 0.8 },
            { x: this.canvas.width * 0.7, y: this.canvas.height * 0.7, strength: 0.7 }
        ];
        
        // 随机初始位置
        this.player = {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            signalValue: 0,
            name: '你'
        };
        
        this.otherPlayers = new Map();
        
        // 移动控制状态
        this.movement = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        
        // 绑定键盘事件
        this.bindControls();
        
        // 计算初始信号值
        this.player.signalValue = this.calculateSignalValue(this.player.x, this.player.y);
        
        // 发送初始位置
        this.socket.emit('player-move', {
            x: this.player.x,
            y: this.player.y,
            signalValue: this.player.signalValue
        });
        
        // 请求最新的全局最优点位置
        this.socket.emit('request-global-optimal');
        
        console.log('游戏初始化完成', {
            position: { x: this.player.x, y: this.player.y },
            signalValue: this.player.signalValue,
            perceptionRange: this.perceptionRange
        });

        // 开始游戏循环
        this.startGameLoop();
    }
    
    bindControls() {
        window.addEventListener('keydown', (e) => {
            // 如果实验未开始且不是管理员，则禁止移动
            if (!this.isRunning && !this.isAdmin) {
                return;
            }

            const key = e.key.toLowerCase();
            switch(key) {
                case 'w':
                case 'arrowup':
                    this.movement.up = true;
                    break;
                case 's':
                case 'arrowdown':
                    this.movement.down = true;
                    break;
                case 'a':
                case 'arrowleft':
                    this.movement.left = true;
                    break;
                case 'd':
                case 'arrowright':
                    this.movement.right = true;
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            switch(key) {
                case 'w':
                case 'arrowup':
                    this.movement.up = false;
                    break;
                case 's':
                case 'arrowdown':
                    this.movement.down = false;
                    break;
                case 'a':
                case 'arrowleft':
                    this.movement.left = false;
                    break;
                case 'd':
                case 'arrowright':
                    this.movement.right = false;
                    break;
            }
        });
    }
    
    calculateSignalValue(x, y) {
        // 全局最优点的信号值计算
        const globalDistance = Math.sqrt(
            Math.pow(x - this.globalOptimal.x, 2) + 
            Math.pow(y - this.globalOptimal.y, 2)
        );
        const globalSignal = Math.exp(-globalDistance * globalDistance / (2 * Math.pow(100, 2)));
        
        // 局部最优点的信号值计算
        let localSignals = this.localOptima.map(peak => {
            const distance = Math.sqrt(
                Math.pow(x - peak.x, 2) + 
                Math.pow(y - peak.y, 2)
            );
            return peak.strength * Math.exp(-distance * distance / (2 * Math.pow(80, 2)));
        });
        
        // 合并全局和局部信号
        const allSignals = [globalSignal, ...localSignals];
        const originalValue = Math.max(...allSignals);
        
        // 将0-1范围的值放大到0-152范围，让参与者感觉没有明确上限
        // 此处152是一个魔法数字，目的是让显示的值看起来没有明显的上限
        return originalValue * 152;
    }
    
    // 增加一个内部方法，计算原始比例(0-1)的信号值，用于热力图渲染
    _calculateOriginalScaleSignalValue(x, y) {
        // 全局最优点的信号值计算
        const globalDistance = Math.sqrt(
            Math.pow(x - this.globalOptimal.x, 2) + 
            Math.pow(y - this.globalOptimal.y, 2)
        );
        const globalSignal = Math.exp(-globalDistance * globalDistance / (2 * Math.pow(100, 2)));
        
        // 局部最优点的信号值计算
        let localSignals = this.localOptima.map(peak => {
            const distance = Math.sqrt(
                Math.pow(x - peak.x, 2) + 
                Math.pow(y - peak.y, 2)
            );
            return peak.strength * Math.exp(-distance * distance / (2 * Math.pow(80, 2)));
        });
        
        // 合并全局和局部信号
        const allSignals = [globalSignal, ...localSignals];
        return Math.max(...allSignals);
    }
    
    updateOtherPlayer(data) {
        if (!data.participantId || !data.position) {
            console.error('无效的参与者数据:', data);
            return;
        }
        
        console.log('更新其他参与者:', data);
        const player = {
            x: data.position.x,
            y: data.position.y,
            name: data.name,
            signalValue: data.signalValue
        };
        this.otherPlayers.set(data.participantId, player);
        console.log('当前其他参与者列表:', Array.from(this.otherPlayers.entries()));
    }
    
    removePlayer(participantId) {
        this.otherPlayers.delete(participantId);
    }
    
    updatePerceptionRange(range) {
        this.perceptionRange = range;
    }
    
    start() {
        console.log('游戏开始');
        this.isRunning = true;
    }
    
    stop() {
        console.log('游戏结束');
        this.isRunning = false;
    }
    
    startGameLoop() {
        // 使用箭头函数保持this上下文
        const loop = () => {
            if (this.isAdmin) {
                // 管理员模式下，每帧都重新计算和绘制热力图
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.drawGrid();
                this.drawHeatmap();
                if (this.isRunning) {
                    this.drawPerceptionRange();
                }
                this.otherPlayers.forEach((player) => {
                    this.drawPlayer(player, false);
                });
                this.drawPlayer(this.player, true);
            } else {
                // 非管理员模式下的正常绘制
                this.update();
                this.draw();
            }
            requestAnimationFrame(loop);
        };
        loop();
    }
    
    update() {
        // 如果实验未开始且不是管理员，则禁止移动
        if (!this.isRunning && !this.isAdmin) {
            return;
        }

        // 更新玩家位置
        let dx = 0;
        let dy = 0;
        const speed = CONFIG.MOVEMENT_SPEED;

        // 计算移动向量
        if (this.movement.up) dy -= 1;
        if (this.movement.down) dy += 1;
        if (this.movement.left) dx -= 1;
        if (this.movement.right) dx += 1;

        // 对角线移动时保持相同速度
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / length) * speed;
            dy = (dy / length) * speed;
        } else {
            // 单方向移动
            if (dx !== 0) dx *= speed;
            if (dy !== 0) dy *= speed;
        }

        // 更新位置
        if (dx !== 0 || dy !== 0) {
            const newX = Math.max(0, Math.min(this.canvas.width, this.player.x + dx));
            const newY = Math.max(0, Math.min(this.canvas.height, this.player.y + dy));
            
            this.player.x = newX;
            this.player.y = newY;
            
            // 计算新位置的信号值
            this.player.signalValue = this.calculateSignalValue(newX, newY);
            
            // 发送位置更新到服务器
            this.socket.emit('player-move', {
                x: newX,
                y: newY,
                signalValue: this.player.signalValue
            });
        }

        // 更新当前玩家的信号值显示
        const signalElement = document.getElementById('current-signal');
        if (signalElement) {
            signalElement.textContent = Math.round(this.player.signalValue * 100) / 100;
        }
        
        // 更新感知范围内的参与者列表
        this.updateNearbyParticipants();
    }
    
    updateNearbyParticipants() {
        const nearbyList = document.getElementById('nearby-participants');
        if (!nearbyList) return;
        
        nearbyList.innerHTML = '';
        this.otherPlayers.forEach((player, id) => {
            const distance = Math.sqrt(
                Math.pow(player.x - this.player.x, 2) + 
                Math.pow(player.y - this.player.y, 2)
            );
            
            const li = document.createElement('li');
            if (this.isRunning && distance <= this.perceptionRange) {
                li.textContent = `${player.name}: ${Math.round(player.signalValue * 100) / 100}`;
            } else {
                li.textContent = `${player.name}`;
            }
            nearbyList.appendChild(li);
        });
    }
    
    draw() {
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制网格
        this.drawGrid();
        
        // 绘制感知范围（仅在实验运行时）
        if (this.isRunning) {
            this.drawPerceptionRange();
        }
        
        // 找出感知范围内信号值比自己大的参与者中，信号值最大的那个
        let maxSignalPlayer = null;
        let maxSignalValue = this.player.signalValue;
        
        if (this.isRunning) {
            this.otherPlayers.forEach((player) => {
                const distance = this.getDistance(player);
                if (distance <= this.perceptionRange && player.signalValue > maxSignalValue) {
                    maxSignalValue = player.signalValue;
                    maxSignalPlayer = player;
                }
            });
        }
        
        // 绘制所有其他玩家
        this.otherPlayers.forEach((player) => {
            // 如果这个玩家是感知范围内信号值最大的，则用红色绘制
            if (maxSignalPlayer && player === maxSignalPlayer) {
                this.drawPlayer(player, false, true);
            } else {
                this.drawPlayer(player, false, false);
            }
        });
        
        // 绘制当前玩家
        this.drawPlayer(this.player, true, false);
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
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
    
    drawPerceptionRange() {
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.perceptionRange, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(74, 144, 226, 0.1)';
        this.ctx.fill();
    }
    
    drawPlayer(player, isCurrentPlayer, isMaxSignal) {
        if (!player || typeof player.x !== 'number' || typeof player.y !== 'number') {
            console.error('无效的玩家数据:', player);
            return;
        }
        
        const size = isCurrentPlayer ? 10 : 8;
        
        // 始终绘制玩家圆圈和名字
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, size, 0, Math.PI * 2);
        
        // 设置颜色：当前玩家蓝色，最大信号值玩家红色，其他玩家绿色
        if (isCurrentPlayer) {
            this.ctx.fillStyle = '#1a73e8';
        } else if (isMaxSignal) {
            this.ctx.fillStyle = '#e53935'; // 红色
        } else {
            this.ctx.fillStyle = '#34a853';
        }
        
        this.ctx.fill();
        
        // 如果是当前玩家，添加高亮边框
        if (isCurrentPlayer) {
            this.ctx.strokeStyle = '#1557b0';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        
        // 绘制玩家名字
        this.ctx.fillStyle = '#333';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name || '', player.x, player.y - size - 5);
        
        // 只在以下情况显示信号值：
        // 1. 是当前玩家
        // 2. 实验正在运行且在感知范围内
        const distance = this.getDistance(player);
        if (isCurrentPlayer || (this.isRunning && distance <= this.perceptionRange)) {
            this.ctx.fillText(
                Math.round(player.signalValue * 100) / 100,
                player.x,
                player.y + size + 15
            );
        }
    }
    
    getDistance(player) {
        return Math.sqrt(
            Math.pow(player.x - this.player.x, 2) + 
            Math.pow(player.y - this.player.y, 2)
        );
    }
    
    drawHeatmap() {
        console.log('开始绘制热力图，全局最优点位置:', this.globalOptimal);
        const resolution = 10;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // 绘制热力图
        for (let x = 0; x < width; x += resolution) {
            for (let y = 0; y < height; y += resolution) {
                // 使用原始比例的信号值(0-1)用于热力图渲染
                const value = this._calculateOriginalScaleSignalValue(x, y);
                const intensity = Math.min(255, Math.round(value * 255));
                
                this.ctx.fillStyle = `rgba(255, ${255 - intensity}, ${255 - intensity}, 0.3)`;
                this.ctx.fillRect(x, y, resolution, resolution);
            }
        }
        
        // 绘制全局最优点的光晕效果
        const gradient = this.ctx.createRadialGradient(
            this.globalOptimal.x, this.globalOptimal.y, 5,
            this.globalOptimal.x, this.globalOptimal.y, 30
        );
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        
        this.ctx.beginPath();
        this.ctx.arc(this.globalOptimal.x, this.globalOptimal.y, 30, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        // 标记全局最优点
        this.ctx.beginPath();
        this.ctx.arc(this.globalOptimal.x, this.globalOptimal.y, 12, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // 标记局部最优点
        this.localOptima.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(192, 192, 192, 0.8)';
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(128, 128, 128, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
        
        console.log('热力图绘制完成，全局最优点位置:', this.globalOptimal);
    }
    
    setAdmin(isAdmin) {
        this.isAdmin = isAdmin;
        // 设置为管理员时立即绘制一次热力图
        if (isAdmin) {
            console.log('设置为管理员，立即绘制热力图');
            this.draw();
        }
    }
    
    updateGlobalOptimal(x, y) {
        console.log('Game.updateGlobalOptimal - 开始更新全局最优点');
        console.log('当前全局最优点位置:', this.globalOptimal);
        console.log('新的全局最优点位置:', { x, y });
        
        // 更新全局最优点位置
        this.globalOptimal = { x: parseInt(x), y: parseInt(y) };
        
        // 更新当前玩家的信号值
        this.player.signalValue = this.calculateSignalValue(this.player.x, this.player.y);
        
        // 更新其他玩家的信号值
        this.otherPlayers.forEach((player, id) => {
            player.signalValue = this.calculateSignalValue(player.x, player.y);
        });
        
        // 发送更新到服务器
        this.socket.emit('update-global-optimal', this.globalOptimal);
        
        console.log('Game.updateGlobalOptimal - 更新完成，新位置:', this.globalOptimal);
    }
} 