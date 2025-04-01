// 导入模块
import { CONFIG } from './config.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

let game = null;
let ui = null;
let socket = null;
let isAdmin = false;
let currentParticipants = new Map();
let perceptionRange = 100;
let experimentRunning = false;
let experimentStartTime = null;
let experimentDuration = 300; // 5分钟实验时间
let adminButtonHandler = null;

function createLoginForm() {
    // 生成唯一ID
    const uniqueId = Date.now().toString();
    
    // 检查是否已存在登录容器
    const existingContainer = document.getElementById('login-container');
    if (existingContainer) {
        console.log('登录表单已存在，跳过创建');
        return;
    }

    const loginContainer = document.createElement('div');
    loginContainer.id = 'login-container';
    loginContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 100vh;
        padding: 20px;
        background-color: #f5f5f5;
    `;
    
    // 添加标题
    const title = document.createElement('h1');
    title.textContent = '人群协作寻优线上实验平台';
    title.style.cssText = `
        text-align: center;
        margin: 40px 0;
        color: #333;
        font-size: 28px;
        font-weight: bold;
    `;
    loginContainer.appendChild(title);

    // 创建主要内容区域
    const mainContent = document.createElement('div');
    mainContent.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: flex-start;
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        gap: 40px;
    `;

    // 创建登录表单容器
    const formContainer = document.createElement('div');
    formContainer.style.cssText = `
        flex: 1;
        max-width: 400px;
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;

    // 添加提示信息
    const tips = document.createElement('div');
    tips.className = 'login-tips';
    tips.style.cssText = `
        width: 300px;
        background-color: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;
    tips.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #333;">实验说明</h3>
        <div class="tip-item" style="margin-bottom: 10px;">1. 姓名填自己的名字拼音</div>
        <div class="tip-item" style="margin-bottom: 10px;">2. 不要勾选管理员登录</div>
        <div class="tip-item" style="margin-bottom: 10px;">3. 登录完成后，管理员点击开始，才能移动</div>
    `;

    const loginForm = document.createElement('form');
    loginForm.id = `login-form-${uniqueId}`;
    loginForm.className = 'login-form';
    loginForm.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 20px;
    `;
    loginForm.innerHTML = `
        <div class="form-group" style="display: flex; flex-direction: column; gap: 8px;">
            <label for="participant-name" style="color: #666;">姓名:</label>
            <input type="text" id="participant-name" required style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div class="form-group" style="display: flex; flex-direction: column; gap: 8px;">
            <label for="experiment-id" style="color: #666;">实验ID:</label>
            <input type="text" id="experiment-id" required style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="is-admin">
            <label for="is-admin" style="color: #666;">管理员登录</label>
        </div>
        <div id="admin-password-group" style="display: none;">
            <div class="form-group" style="display: flex; flex-direction: column; gap: 8px;">
                <label for="admin-password" style="color: #666;">管理员密码:</label>
                <input type="password" id="admin-password" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <div id="password-error" style="color: red; font-size: 14px; display: none;">密码错误</div>
            </div>
        </div>
        <button type="submit" style="
            padding: 10px 20px;
            background-color: #4a90e2;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.2s;
        ">加入实验</button>
    `;

    // 添加管理员密码输入框的显示/隐藏逻辑
    const isAdminCheckbox = loginForm.querySelector('#is-admin');
    const adminPasswordGroup = loginForm.querySelector('#admin-password-group');
    const passwordError = loginForm.querySelector('#password-error');

    isAdminCheckbox.addEventListener('change', (e) => {
        adminPasswordGroup.style.display = e.target.checked ? 'block' : 'none';
        passwordError.style.display = 'none';
    });

    // 组装内容
    formContainer.appendChild(loginForm);
    mainContent.appendChild(formContainer);
    mainContent.appendChild(tips);
    loginContainer.appendChild(mainContent);

    // 添加表单提交事件监听器
    loginForm.addEventListener('submit', function handleSubmit(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // 获取表单中的值
        const participantName = loginForm.querySelector('#participant-name').value.trim();
        const experimentId = loginForm.querySelector('#experiment-id').value.trim();
        const isAdminChecked = loginForm.querySelector('#is-admin').checked;
        const adminPassword = loginForm.querySelector('#admin-password')?.value || '';

        // 验证表单
        if (!participantName || !experimentId) {
            alert('请填写完整信息');
            return;
        }

        // 管理员密码验证
        if (isAdminChecked) {
            const correctPassword = '785509';
            if (adminPassword !== correctPassword) {
                passwordError.style.display = 'block';
                return;
            }
        }

        // 隐藏错误信息
        passwordError.style.display = 'none';

        // 设置全局isAdmin变量
        isAdmin = isAdminChecked;
        console.log('提交加入实验请求:', { participantName, experimentId, isAdmin });

        // 发送加入实验请求
        if (socket && socket.connected) {
            // 禁用提交按钮防止重复提交
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.style.backgroundColor = '#ccc';
            }

            socket.emit('join-experiment', {
                experimentId,
                participantName,
                isAdmin: isAdminChecked
            });
        } else {
            console.error('未连接到服务器');
            alert('未连接到服务器，请刷新页面重试');
        }
    });

    document.body.appendChild(loginContainer);
}

// 使用立即执行函数来控制初始化
const initApp = (() => {
    let initialized = false;

    return () => {
        if (initialized) {
            console.log('应用已经初始化，跳过');
            return;
        }

        console.log('开始初始化应用');
        
        // 清理所有可能存在的旧元素
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = ''; // 清空app容器
        }
        
        // 清理可能存在于body中的其他元素
        const loginContainer = document.getElementById('login-container');
        const experimentContainer = document.getElementById('experiment-container');
        const optimalPointPanel = document.getElementById('optimal-point-panel');
        
        [loginContainer, experimentContainer, optimalPointPanel].forEach(el => {
            if (el) el.remove();
        });

        initialized = true;
        
        // 重置所有全局变量
        game = null;
        ui = null;
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        isAdmin = false;
        currentParticipants.clear();
        perceptionRange = 100;
        experimentRunning = false;
        experimentStartTime = null;
        experimentDuration = 300;
        adminButtonHandler = null;

        // 创建新的登录表单
        createLoginForm();

        // 初始化socket连接
        socket = io(CONFIG.SERVER_URL);
        
        // 设置socket事件监听器
        socket.on('connect', () => {
            console.log('已连接到服务器');
        });

        socket.on('connect_error', (error) => {
            console.error('连接错误:', error);
        });

        socket.on('disconnect', () => {
            console.log('与服务器断开连接');
        });

        // 设置其他socket事件监听器
        setupSocketListeners();
    };
})();

// 设置socket事件监听器的函数
function setupSocketListeners() {
    if (!socket) return;

    // 处理加入实验的响应
    socket.on('joined-experiment', (data) => {
        console.log('成功加入实验:', data);
        perceptionRange = data.perceptionRange;
        isAdmin = data.isAdmin;
        experimentRunning = data.isRunning;
        experimentStartTime = data.startTime;
        experimentDuration = data.duration / 1000;
        
        const loginContainer = document.getElementById('login-container');
        if (loginContainer) {
            loginContainer.remove();
        }
        
        setupExperimentUI(data);
        
        if (!isAdmin) {
            socket.emit('request-participants');
        }
        
        if (experimentRunning && experimentStartTime) {
            startExperimentTimer();
        }
    });

    // 监听参与者加入
    socket.on('participant-joined', (data) => {
        console.log('新参与者加入:', data);
        if (!currentParticipants.has(data.participantId)) {
            currentParticipants.set(data.participantId, data);
            updateParticipantList();
            if (game) {
                console.log('更新游戏中的参与者:', data);
                game.updateOtherPlayer({
                    participantId: data.participantId,
                    name: data.name,
                    position: data.position,
                    signalValue: data.signalValue
                });
            }
        }
    });

    // 监听参与者列表更新
    socket.on('participants-list', (participants) => {
        console.log('收到参与者列表:', participants);
        currentParticipants.clear();
        participants.forEach(participant => {
            currentParticipants.set(participant.participantId, participant);
            if (game) {
                game.updateOtherPlayer({
                    participantId: participant.participantId,
                    name: participant.name,
                    position: participant.position,
                    signalValue: participant.signalValue
                });
            }
        });
        updateParticipantList();
    });

    // 监听参与者更新
    socket.on('player-update', (data) => {
        console.log('收到参与者更新:', data);
        if (!currentParticipants.has(data.participantId)) {
            currentParticipants.set(data.participantId, {
                participantId: data.participantId,
                name: data.name,
                position: data.position,
                signalValue: data.signalValue
            });
        } else {
            const participant = currentParticipants.get(data.participantId);
            participant.position = data.position;
            participant.signalValue = data.signalValue;
        }
        
        if (game) {
            console.log('更新游戏中的参与者位置:', data);
            game.updateOtherPlayer({
                participantId: data.participantId,
                name: data.name,
                position: data.position,
                signalValue: data.signalValue
            });
        }
        updateParticipantList();
    });

    // 监听感知范围更新
    socket.on('perception-range-update', (data) => {
        console.log('感知范围更新:', data);
        perceptionRange = data.range;
        if (game) {
            game.updatePerceptionRange(perceptionRange);
        }
    });

    // 监听实验开始
    socket.on('experiment-start', (data) => {
        console.log('实验开始:', data);
        experimentRunning = true;
        experimentStartTime = data.startTime;
        experimentDuration = data.duration / 1000; // 转换为秒
        perceptionRange = data.perceptionRange;
        
        // 更新UI状态
        const timerElement = document.getElementById('time-remaining');
        if (timerElement) {
            timerElement.textContent = '05:00';
        }
        
        if (game) {
            game.updatePerceptionRange(perceptionRange);
            game.start();
        }
        
        // 开始计时器
        startExperimentTimer();
    });

    // 监听实验结束
    socket.on('experiment-end', () => {
        console.log('实验结束');
        experimentRunning = false;
        if (game) {
            game.stop();
        }
    });

    // 监听实验数据
    socket.on('experiment-data', (data) => {
        console.log('收到实验数据:', data);
        if (isAdmin) {
            downloadExperimentData(data);
        }
    });

    // 监听参与者数量更新
    socket.on('participant-count', (count) => {
        console.log('参与者数量更新:', count);
        updateParticipantCount(count);
    });

    // 监听全局最优点更新
    socket.on('global-optimal-update', (data) => {
        console.log('收到全局最优点更新:', data);
        if (game) {
            // 更新游戏中的全局最优点位置
            game.globalOptimal = data.globalOptimal;
            
            // 重新计算当前玩家的信号值
            game.player.signalValue = game.calculateSignalValue(game.player.x, game.player.y);
            
            // 更新热力图
            game.drawHeatmap();
        }
    });

    // 监听局部最优点更新
    socket.on('local-optima-update', (data) => {
        console.log('收到局部最优点更新:', data);
        if (game) {
            game.localOptima = data.localOptima;
            game.drawHeatmap();
        }
    });

    // 添加实验数据清除成功的监听器
    socket.on('experiment-data-cleared', (data) => {
        console.log('实验数据已清除:', data);
        alert('实验数据已成功清除！');
        // 重新加载页面以刷新状态
        window.location.reload();
    });
}

function setupExperimentUI(data) {
    console.log('设置实验UI:', data);
    console.log('是否为管理员:', isAdmin);
    
    // 移除任何现有的实验容器和全局最优点面板
    const existingContainer = document.getElementById('experiment-container');
    const existingPanel = document.getElementById('optimal-point-panel');
    if (existingContainer) {
        existingContainer.remove();
    }
    if (existingPanel) {
        existingPanel.remove();
    }
    
    // 如果存在旧的事件处理器，先移除它
    if (adminButtonHandler) {
        document.removeEventListener('click', adminButtonHandler);
        adminButtonHandler = null;
    }
    
    // 创建新容器
    const container = document.createElement('div');
    container.id = 'experiment-container';
    
    // 确保isAdmin变量正确设置
    isAdmin = data.isAdmin;
    console.log('设置isAdmin为:', isAdmin);
    
    if (isAdmin) {
        console.log('创建管理员UI');
        
        // 创建全局最优点设置面板
        const optimalPointPanel = document.createElement('div');
        optimalPointPanel.id = 'optimal-point-panel';
        optimalPointPanel.className = 'floating-panel';
        optimalPointPanel.style.cssText = 'display: block !important; visibility: visible !important;';
        
        // 创建面板内容
        const title = document.createElement('h3');
        title.textContent = '全局最优点设置';
        
        const inputRow = document.createElement('div');
        inputRow.className = 'input-row';
        
        // 创建X坐标输入组
        const xGroup = document.createElement('div');
        xGroup.className = 'input-group';
        const xLabel = document.createElement('label');
        xLabel.htmlFor = 'optimal-x';
        xLabel.textContent = 'X坐标:';
        const xInput = document.createElement('input');
        xInput.type = 'number';
        xInput.id = 'optimal-x';
        xInput.value = '400';
        xInput.min = '0';
        xInput.max = '800';
        xGroup.appendChild(xLabel);
        xGroup.appendChild(xInput);
        
        // 创建Y坐标输入组
        const yGroup = document.createElement('div');
        yGroup.className = 'input-group';
        const yLabel = document.createElement('label');
        yLabel.htmlFor = 'optimal-y';
        yLabel.textContent = 'Y坐标:';
        const yInput = document.createElement('input');
        yInput.type = 'number';
        yInput.id = 'optimal-y';
        yInput.value = '300';
        yInput.min = '0';
        yInput.max = '600';
        yGroup.appendChild(yLabel);
        yGroup.appendChild(yInput);
        
        // 组装面板
        inputRow.appendChild(xGroup);
        inputRow.appendChild(yGroup);
        optimalPointPanel.appendChild(title);
        optimalPointPanel.appendChild(inputRow);
        
        // 创建管理员UI
        container.innerHTML = `
            <div id="admin-panel">
                <h2>管理员控制面板</h2>
                
                <div class="control-section">
                    <div class="control-group">
                        <label for="perception-range">感知范围:</label>
                        <input type="number" id="perception-range" value="${perceptionRange}" min="10" max="500">
                        <button id="update-range" data-action="update-range">更新范围</button>
                    </div>
                
                    <div class="control-group">
                        <button id="start-experiment" data-action="start-experiment">开始实验</button>
                        <button id="end-experiment" data-action="end-experiment">结束实验</button>
                        <button id="export-data" data-action="export-data">导出数据</button>
                        <button id="perturb-local-optima" data-action="perturb-local-optima">随机扰动局部最优点</button>
                        <button id="randomize-global-optimal" data-action="randomize-global-optimal">随机变化全局最优点</button>
                        <button id="clear-experiment-data" data-action="clear-experiment-data" class="danger-button">清除实验数据</button>
                    </div>
                </div>
                
                <div class="status-section">
                    <div class="status-group">
                        <div>参与者数量: <span id="participant-count">0</span></div>
                        <div>剩余时间: <span id="time-remaining">05:00</span></div>
                    </div>
                    <div id="participant-list">
                        <h3>参与者列表</h3>
                        <ul></ul>
                    </div>
                </div>
            </div>
            <div id="canvas-container">
                <canvas id="experiment-canvas"></canvas>
            </div>
        `;
        
        // 先将容器添加到文档中
        document.body.appendChild(container);
        
        // 将全局最优点设置面板添加到文档中
        document.body.appendChild(optimalPointPanel);
        
        // 获取画布元素
        const canvas = document.getElementById('experiment-canvas');
        if (!canvas) {
            console.error('无法找到画布元素');
            return;
        }
        
        // 初始化游戏实例
        try {
            game = new Game(canvas, socket, perceptionRange);
            game.setAdmin(true);
            
            // 添加输入事件监听器
            const updateGlobalOptimal = () => {
                console.log('触发更新全局最优点');
                const x = parseInt(xInput.value) || 400;
                const y = parseInt(yInput.value) || 300;
                console.log('输入框的值:', { x, y });
                
                if (game) {
                    game.updateGlobalOptimal(x, y);
                }
            };
            
            // 为输入框添加多个事件监听器
            ['input', 'change', 'blur'].forEach(eventType => {
                xInput.addEventListener(eventType, (e) => {
                    console.log(`X坐标输入框 ${eventType} 事件:`, e.target.value);
                    updateGlobalOptimal();
                });
                
                yInput.addEventListener(eventType, (e) => {
                    console.log(`Y坐标输入框 ${eventType} 事件:`, e.target.value);
                    updateGlobalOptimal();
                });
            });
            
            // 添加一个更新按钮
            const updateButton = document.createElement('button');
            updateButton.textContent = '更新全局最优点';
            updateButton.style.marginTop = '10px';
            updateButton.addEventListener('click', () => {
                console.log('点击更新按钮');
                updateGlobalOptimal();
            });
            optimalPointPanel.appendChild(updateButton);
            
            // 初始化更新一次
            updateGlobalOptimal();
            
            // 设置按钮点击处理器
            const handleButtonClick = (event) => {
                const button = event.target;
                if (button.tagName !== 'BUTTON' || !button.dataset.action) return;
                
                const action = button.dataset.action;
                console.log('按钮点击:', action);
                
                switch (action) {
                    case 'update-range':
                        const rangeInput = document.getElementById('perception-range');
                        if (rangeInput) {
                            const range = parseInt(rangeInput.value);
                            socket.emit('set-perception-range', { range });
                        }
                        break;
                    case 'start-experiment':
                        console.log('管理员点击开始实验');
                        // 发送开始实验请求
                        socket.emit('start-experiment', { 
                            experimentId: data.experimentId
                        });
                        break;
                    case 'end-experiment':
                        socket.emit('end-experiment', { experimentId: data.experimentId });
                        break;
                    case 'export-data':
                        socket.emit('export-data', { experimentId: data.experimentId });
                        break;
                    case 'perturb-local-optima':
                        socket.emit('perturb-local-optima');
                        break;
                    case 'randomize-global-optimal':
                        socket.emit('randomize-global-optimal');
                        break;
                    case 'clear-experiment-data':
                        if (confirm('确定要清除该实验的所有数据吗？此操作不可恢复！')) {
                            socket.emit('clear-experiment-data', { experimentId: data.experimentId });
                        }
                        break;
                }
            };
            
            // 获取所有按钮并添加事件监听器
            const buttons = container.querySelectorAll('button[data-action]');
            buttons.forEach(button => {
                button.addEventListener('click', handleButtonClick);
            });
            
            console.log('管理员UI设置完成');
        } catch (error) {
            console.error('初始化管理员UI时出错:', error);
        }
    } else {
        document.body.appendChild(container);
        setupParticipantUI(container);
    }
    
    // 立即更新参与者列表
    updateParticipantList();
}

function setupParticipantUI(container) {
    console.log('设置参与者UI');
    const canvas = document.createElement('canvas');
    canvas.id = 'experiment-canvas';
    container.appendChild(canvas);
    
    const infoPanel = document.createElement('div');
    infoPanel.id = 'info-panel';
    infoPanel.innerHTML = `
        <div>当前信号值: <span id="current-signal">0</span></div>
        <div>剩余时间: <span id="time-remaining">05:00</span></div>
        <div>感知范围内的参与者:</div>
        <ul id="nearby-participants"></ul>
    `;
    container.appendChild(infoPanel);
    
    game = new Game(canvas, socket, perceptionRange);
    game.setAdmin(false); // 设置为参与者模式
}

function updateParticipantList() {
    const list = document.querySelector('#participant-list ul');
    const countElement = document.getElementById('participant-count');
    
    if (list) {
        list.innerHTML = '';
        currentParticipants.forEach(participant => {
            const li = document.createElement('li');
            li.textContent = `${participant.name} (信号值: ${Math.round(participant.signalValue * 100) / 100})`;
            list.appendChild(li);
        });
    }
    
    if (countElement) {
        countElement.textContent = currentParticipants.size;
    }
    
    console.log('更新参与者列表:', {
        participantCount: currentParticipants.size,
        participants: Array.from(currentParticipants.values())
    });
}

function updateParticipantCount(count) {
    const countElement = document.getElementById('participant-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

function startExperimentTimer() {
    let lastTime = Date.now();
    
    const updateTimer = () => {
        if (!experimentRunning) return;
        
        const now = Date.now();
        const elapsed = Math.floor((now - experimentStartTime) / 1000);
        const remaining = Math.max(0, experimentDuration - elapsed);
        
        if (Math.floor((now - lastTime) / 1000) >= 1) {
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            const timerElement = document.getElementById('time-remaining');
            if (timerElement) {
                timerElement.textContent = timeString;
            }
            
            lastTime = now;
        }
        
        if (remaining > 0) {
            requestAnimationFrame(updateTimer);
        } else {
            experimentRunning = false;
            if (game) {
                game.stop();
            }
        }
    };
    
    updateTimer();
}

function downloadExperimentData(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_${data.experimentId}_data.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 修改初始化调用，确保只调用一次
document.addEventListener('DOMContentLoaded', initApp, { once: true }); 