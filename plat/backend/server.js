const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 启用CORS
app.use(cors());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../frontend')));

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 创建数据库连接
const db = new Database(path.join(__dirname, 'experiment.db'));

// 初始化数据库表
db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        perception_range INTEGER DEFAULT 100,
        global_optimal_x REAL DEFAULT 400,
        global_optimal_y REAL DEFAULT 300,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id INTEGER,
        x REAL NOT NULL,
        y REAL NOT NULL,
        signal_value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS local_optima (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER,
        x REAL NOT NULL,
        y REAL NOT NULL,
        base_x REAL NOT NULL,
        base_y REAL NOT NULL,
        strength REAL NOT NULL,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );
`);

// 全局变量
let currentExperiment = {
    isRunning: false,
    startTime: null,
    endTime: null,
    duration: 5 * 60 * 1000, // 5分钟
    perceptionRange: 100,
    participants: new Map(),
    adminSocket: null,
    globalOptimal: { x: 400, y: 300 }, // 默认全局最优点位置
    // 添加局部最优点状态
    localOptima: [
        { x: 0.2 * 800, y: 0.3 * 600, baseX: 0.2 * 800, baseY: 0.3 * 600, strength: 0.4 },
        { x: 0.8 * 800, y: 0.3 * 600, baseX: 0.8 * 800, baseY: 0.3 * 600, strength: 0.5 },
        { x: 0.3 * 800, y: 0.8 * 600, baseX: 0.3 * 800, baseY: 0.8 * 600, strength: 0.3 },
        { x: 0.7 * 800, y: 0.7 * 600, baseX: 0.7 * 800, baseY: 0.7 * 600, strength: 0.45 }
    ],
    // 添加最后记录时间映射
    lastRecordTime: new Map(),
    // 添加最后广播时间映射
    lastBroadcastTime: new Map()
};

// 计算信号值函数 - 多峰函数
function calculateSignalValue(position) {
    const canvasWidth = 800;
    const canvasHeight = 600;
    
    // 标准化坐标 (0-1范围)
    const nx = position.x / canvasWidth;
    const ny = position.y / canvasHeight;
    
    // 全局最优点的标准化坐标
    const gx = currentExperiment.globalOptimal.x / canvasWidth;
    const gy = currentExperiment.globalOptimal.y / canvasHeight;
    
    // 计算到全局最优点的距离
    const dx = nx - gx;
    const dy = ny - gy;
    const distToGlobal = Math.sqrt(dx*dx + dy*dy);
    
    // 全局最优点的影响 (高斯函数)
    const globalInfluence = Math.exp(-distToGlobal * distToGlobal / 0.05);
    
    // 局部最优点的影响
    let localInfluence = 0;
    for (const peak of currentExperiment.localOptima) {
        const lx = position.x - peak.x;
        const ly = position.y - peak.y;
        const distToPeak = Math.sqrt(lx*lx + ly*ly) / canvasWidth; // 归一化距离
        localInfluence += peak.strength * Math.exp(-distToPeak * distToPeak / 0.03);
    }
    
    // 组合全局和局部影响
    // 全局最优点的影响更强，确保它是真正的全局最优
    const combinedInfluence = 0.8 * globalInfluence + 0.2 * localInfluence;
    
    // 转换为0-100范围的信号值，值越小表示越接近最优
    return 100 * (1 - combinedInfluence);
}

// 修改局部最优点扰动函数
function perturbLocalOptima() {
    const maxPerturbation = 50; // 最大扰动范围（像素）
    
    currentExperiment.localOptima = currentExperiment.localOptima.map(point => {
        const perturbX = (Math.random() - 0.5) * 2 * maxPerturbation;
        const perturbY = (Math.random() - 0.5) * 2 * maxPerturbation;
        
        return {
            ...point,
            x: Math.max(0, Math.min(800, point.baseX + perturbX)),
            y: Math.max(0, Math.min(600, point.baseY + perturbY))
        };
    });
    
    // 更新数据库中的局部最优点位置
    const deleteLocalOptima = db.prepare('DELETE FROM local_optima WHERE experiment_id = ?');
    const insertLocalOptima = db.prepare(`
        INSERT INTO local_optima (experiment_id, x, y, base_x, base_y, strength)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    deleteLocalOptima.run(currentExperiment.id);
    currentExperiment.localOptima.forEach(point => {
        insertLocalOptima.run(
            currentExperiment.id,
            point.x,
            point.y,
            point.baseX,
            point.baseY,
            point.strength
        );
    });
    
    return currentExperiment.localOptima;
}

// 修改全局最优点随机变化函数
function randomizeGlobalOptimal() {
    const canvasWidth = 800;
    const canvasHeight = 600;
    
    // 在画布范围内随机生成新的全局最优点位置
    currentExperiment.globalOptimal = {
        x: Math.floor(Math.random() * canvasWidth),
        y: Math.floor(Math.random() * canvasHeight)
    };
    
    console.log('随机化全局最优点位置:', currentExperiment.globalOptimal);
    console.log('当前实验ID:', currentExperiment.id);
    
    // 更新数据库中的全局最优点位置
    const updateGlobalOptimal = db.prepare(`
        UPDATE experiments 
        SET global_optimal_x = ?, global_optimal_y = ?
        WHERE id = ?
    `);
    
    try {
        const result = updateGlobalOptimal.run(
            currentExperiment.globalOptimal.x,
            currentExperiment.globalOptimal.y,
            currentExperiment.id
        );
        console.log('数据库更新结果:', result);
        
        // 验证更新是否成功
        const verifyUpdate = db.prepare(`
            SELECT global_optimal_x, global_optimal_y 
            FROM experiments 
            WHERE id = ?
        `).get(currentExperiment.id);
        
        console.log('验证数据库中的值:', verifyUpdate);
    } catch (error) {
        console.error('更新数据库时出错:', error);
    }
    
    return currentExperiment.globalOptimal;
}

// 添加清除实验数据的函数
function clearExperimentData(experimentId) {
    // 先删除所有相关的移动记录
    const deleteMovements = db.prepare(`
        DELETE FROM movements 
        WHERE participant_id IN (
            SELECT id FROM participants WHERE experiment_id = ?
        )
    `);
    
    // 然后删除所有参与者记录
    const deleteParticipants = db.prepare(`
        DELETE FROM participants 
        WHERE experiment_id = ?
    `);
    
    // 最后删除实验记录
    const deleteExperiment = db.prepare(`
        DELETE FROM experiments 
        WHERE id = ?
    `);
    
    // 按顺序执行删除操作
    deleteMovements.run(experimentId);
    deleteParticipants.run(experimentId);
    deleteExperiment.run(experimentId);
    
    console.log(`已清除实验 ${experimentId} 的所有数据`);
}

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log('新客户端连接');

    // 加入实验
    socket.on('join-experiment', (data) => {
        const { experimentId, participantName, isAdmin } = data;
        console.log('参与者加入请求:', { experimentId, participantName, isAdmin });
        
        // 如果是管理员
        if (isAdmin) {
            currentExperiment.adminSocket = socket;
            console.log('管理员加入实验，当前实验ID:', experimentId);
            
            // 确保实验记录存在
            const checkExperiment = db.prepare(`
                SELECT id, perception_range, global_optimal_x, global_optimal_y 
                FROM experiments 
                WHERE id = ?
            `).get(experimentId);
            
            console.log('检查实验记录:', checkExperiment);
            
            if (!checkExperiment) {
                // 如果实验不存在，创建一个新的实验记录
                const createExperiment = db.prepare(`
                    INSERT INTO experiments (id, name, perception_range, global_optimal_x, global_optimal_y)
                    VALUES (?, ?, ?, ?, ?)
                `);
                createExperiment.run(
                    experimentId,
                    `Experiment ${experimentId}`,
                    currentExperiment.perceptionRange,
                    currentExperiment.globalOptimal.x,
                    currentExperiment.globalOptimal.y
                );
                console.log('创建新实验记录');
            } else {
                currentExperiment.perceptionRange = checkExperiment.perception_range;
                currentExperiment.globalOptimal = {
                    x: checkExperiment.global_optimal_x,
                    y: checkExperiment.global_optimal_y
                };
                console.log('加载现有实验记录:', {
                    perceptionRange: currentExperiment.perceptionRange,
                    globalOptimal: currentExperiment.globalOptimal
                });
            }
            currentExperiment.id = experimentId;
            console.log('设置当前实验ID:', currentExperiment.id);
            
            // 加载局部最优点
            const loadLocalOptima = db.prepare(`
                SELECT x, y, base_x, base_y, strength
                FROM local_optima
                WHERE experiment_id = ?
            `);
            const localOptimaData = loadLocalOptima.all(experimentId);
            
            if (localOptimaData.length > 0) {
                currentExperiment.localOptima = localOptimaData.map(point => ({
                    x: point.x,
                    y: point.y,
                    baseX: point.base_x,
                    baseY: point.base_y,
                    strength: point.strength
                }));
            }
            
            socket.emit('joined-experiment', {
                participantId: 'admin',
                experimentId: experimentId,
                isAdmin: true,
                perceptionRange: currentExperiment.perceptionRange,
                isRunning: currentExperiment.isRunning,
                startTime: currentExperiment.startTime,
                duration: currentExperiment.duration,
                globalOptimal: currentExperiment.globalOptimal,
                localOptima: currentExperiment.localOptima
            });
            
            // 发送当前参与者列表给管理员
            const participants = Array.from(currentExperiment.participants.values()).map(p => ({
                participantId: p.id,
                name: p.name,
                position: p.position,
                signalValue: p.signalValue
            }));
            socket.emit('participants-list', participants);
            
            return;
        }
        
        // 确保实验记录存在
        const checkExperiment = db.prepare('SELECT id FROM experiments WHERE id = ?').get(experimentId);
        if (!checkExperiment) {
            socket.emit('error', { message: '实验不存在' });
            return;
        }
        
        // 创建参与者记录
        const stmt = db.prepare(`
            INSERT INTO participants (experiment_id, name)
            VALUES (?, ?)
        `);
        const result = stmt.run(experimentId, participantName);
        
        const participant = {
            id: result.lastInsertRowid,
            name: participantName,
            socketId: socket.id,
            position: {
                x: Math.random() * 800,
                y: Math.random() * 600
            },
            signalValue: 0
        };

        currentExperiment.participants.set(socket.id, participant);
        console.log('新参与者已添加:', participant);
        
        // 发送确认消息，包含实验状态
        socket.emit('joined-experiment', {
            participantId: participant.id,
            experimentId: experimentId,
            isAdmin: false,
            perceptionRange: currentExperiment.perceptionRange,
            isRunning: currentExperiment.isRunning,
            startTime: currentExperiment.startTime,
            duration: currentExperiment.duration
        });

        // 广播新参与者加入给所有客户端
        io.emit('participant-joined', {
            participantId: participant.id,
            name: participantName,
            position: participant.position,
            signalValue: participant.signalValue
        });

        // 广播参与者数量更新
        io.emit('participant-count', currentExperiment.participants.size);
    });

    // 请求参与者列表
    socket.on('request-participants', () => {
        console.log('收到参与者列表请求');
        const participants = Array.from(currentExperiment.participants.values()).map(p => ({
            participantId: p.id,
            name: p.name,
            position: p.position,
            signalValue: p.signalValue
        }));
        socket.emit('participants-list', participants);
        console.log('发送参与者列表:', participants);
    });

    // 处理移动更新
    socket.on('player-move', (data) => {
        const participant = currentExperiment.participants.get(socket.id);
        if (!participant) {
            console.log('未找到参与者:', socket.id);
            return;
        }

        const { x, y, signalValue } = data;
        participant.position = { x, y };
        participant.signalValue = signalValue;

        // 记录移动数据（仅在实验运行时记录）
        if (currentExperiment.isRunning) {
            try {
                // 检查参与者是否仍然存在于数据库中
                const checkParticipant = db.prepare('SELECT id FROM participants WHERE id = ?').get(participant.id);
                if (!checkParticipant) {
                    console.log('参与者已不存在于数据库中:', participant.id);
                    return;
                }

                // 获取当前时间
                const currentTime = Date.now();
                const lastRecordTime = currentExperiment.lastRecordTime.get(participant.id) || 0;
                
                // 检查是否已经过了0.1秒
                if (currentTime - lastRecordTime >= 100) {
                    const stmt = db.prepare(`
                        INSERT INTO movements (participant_id, x, y, signal_value)
                        VALUES (?, ?, ?, ?)
                    `);
                    stmt.run(participant.id, x, y, signalValue);
                    
                    // 更新最后记录时间
                    currentExperiment.lastRecordTime.set(participant.id, currentTime);
                }
            } catch (error) {
                console.error('记录移动数据时出错:', error);
            }
        }

        // 获取当前时间
        const currentTime = Date.now();
        const lastBroadcastTime = currentExperiment.lastBroadcastTime.get(participant.id) || 0;
        
        // 检查是否已经过了0.2秒（广播频率设为0.2秒）
        if (currentTime - lastBroadcastTime >= 200) {
            // 广播位置更新给所有参与者
            io.emit('player-update', {
                participantId: participant.id,
                name: participant.name,
                position: participant.position,
                signalValue: participant.signalValue
            });
            
            // 更新最后广播时间
            currentExperiment.lastBroadcastTime.set(participant.id, currentTime);
            
            console.log('广播位置更新:', {
                participantId: participant.id,
                name: participant.name,
                position: participant.position,
                signalValue: participant.signalValue
            });
        }
    });

    // 管理员控制 - 设置感知范围
    socket.on('set-perception-range', (data) => {
        if (socket !== currentExperiment.adminSocket) {
            console.log('非管理员尝试设置感知范围');
            return;
        }
        
        const { range } = data;
        if (range < 10 || range > 500) {
            console.log('感知范围超出限制');
            return;
        }
        
        currentExperiment.perceptionRange = range;
        
        // 更新数据库中的感知范围
        const stmt = db.prepare('UPDATE experiments SET perception_range = ? WHERE id = ?');
        stmt.run(range, currentExperiment.id);
        
        // 广播新的感知范围给所有参与者
        io.emit('perception-range-update', { range });
        console.log('感知范围已更新:', range);
    });

    // 管理员控制 - 开始实验
    socket.on('start-experiment', (data) => {
        if (socket !== currentExperiment.adminSocket) {
            console.log('非管理员尝试开始实验');
            return;
        }
        
        if (currentExperiment.isRunning) {
            console.log('实验已经在运行中');
            return;
        }
        
        console.log('开始实验，当前实验ID:', currentExperiment.id);
        console.log('当前全局最优点位置:', currentExperiment.globalOptimal);
        
        // 从数据库获取最新的全局最优点位置
        const getGlobalOptimal = db.prepare(`
            SELECT global_optimal_x, global_optimal_y 
            FROM experiments 
            WHERE id = ?
        `).get(currentExperiment.id);
        
        console.log('从数据库获取的全局最优点位置:', getGlobalOptimal);
        
        if (getGlobalOptimal) {
            currentExperiment.globalOptimal = {
                x: getGlobalOptimal.global_optimal_x,
                y: getGlobalOptimal.global_optimal_y
            };
            console.log('更新后的全局最优点位置:', currentExperiment.globalOptimal);
        } else {
            console.log('警告：未找到实验记录');
        }
        
        currentExperiment.isRunning = true;
        currentExperiment.startTime = Date.now();
        
        // 重新计算所有参与者的信号值
        currentExperiment.participants.forEach((participant) => {
            participant.signalValue = calculateSignalValue(participant.position);
        });
        
        console.log('实验开始:', {
            experimentId: currentExperiment.id,
            startTime: currentExperiment.startTime,
            perceptionRange: currentExperiment.perceptionRange,
            globalOptimal: currentExperiment.globalOptimal,
            participantCount: currentExperiment.participants.size
        });
        
        // 向所有客户端广播实验开始事件
        io.emit('experiment-start', {
            experimentId: currentExperiment.id,
            startTime: currentExperiment.startTime,
            perceptionRange: currentExperiment.perceptionRange,
            duration: currentExperiment.duration,
            globalOptimal: currentExperiment.globalOptimal
        });
        
        // 向所有参与者广播当前的参与者位置
        currentExperiment.participants.forEach((participant) => {
            io.emit('player-update', {
                participantId: participant.id,
                name: participant.name,
                position: participant.position,
                signalValue: participant.signalValue
            });
            
            console.log('广播参与者位置:', {
                participantId: participant.id,
                name: participant.name,
                position: participant.position
            });
        });
        
        // 设置实验结束定时器
        setTimeout(() => {
            if (currentExperiment.isRunning) {
                currentExperiment.isRunning = false;
                currentExperiment.endTime = Date.now();
                io.emit('experiment-end', {
                    experimentId: currentExperiment.id,
                    endTime: currentExperiment.endTime
                });
                console.log('实验自动结束');
            }
        }, currentExperiment.duration);
    });

    // 管理员控制 - 结束实验
    socket.on('end-experiment', (data) => {
        if (socket !== currentExperiment.adminSocket) return;
        
        currentExperiment.isRunning = false;
        currentExperiment.endTime = Date.now();
        
        io.emit('experiment-end', {
            experimentId: data.experimentId,
            endTime: currentExperiment.endTime
        });
    });

    // 处理局部最优点扰动请求
    socket.on('perturb-local-optima', () => {
        if (socket !== currentExperiment.adminSocket) {
            console.log('非管理员尝试扰动局部最优点');
            return;
        }
        
        const newLocalOptima = perturbLocalOptima();
        console.log('局部最优点已扰动:', newLocalOptima);
        
        // 广播更新给所有客户端
        io.emit('local-optima-update', {
            localOptima: newLocalOptima
        });
        
        // 重新计算所有参与者的信号值
        currentExperiment.participants.forEach((participant) => {
            participant.signalValue = calculateSignalValue(participant.position);
        });
    });

    // 修改导出数据处理器
    socket.on('export-data', async (data) => {
        if (socket !== currentExperiment.adminSocket) return;
        
        const stmt = db.prepare(`
            SELECT 
                p.name as participant_name,
                m.x, m.y, m.signal_value,
                m.timestamp
            FROM movements m
            JOIN participants p ON m.participant_id = p.id
            JOIN experiments e ON p.experiment_id = e.id
            WHERE p.experiment_id = ?
            ORDER BY m.timestamp
        `);
        
        const experimentData = stmt.all(data.experimentId);
        
        // 获取实验的感知范围
        const experimentStmt = db.prepare('SELECT perception_range FROM experiments WHERE id = ?');
        const experimentInfo = experimentStmt.get(data.experimentId);
        
        // 构建新的数据格式
        const formattedData = {
            experimentId: data.experimentId,
            perception_range: experimentInfo.perception_range,
            // 添加全局最优点位置
            global_optimal: {
                x: currentExperiment.globalOptimal.x,
                y: currentExperiment.globalOptimal.y
            },
            // 添加局部最优点位置
            local_optima: currentExperiment.localOptima.map((point, index) => ({
                id: index + 1,
                x: point.x,
                y: point.y,
                base_x: point.baseX,
                base_y: point.baseY,
                strength: point.strength
            })),
            data: experimentData
        };
        
        socket.emit('experiment-data', formattedData);
    });

    // 处理全局最优点更新
    socket.on('update-global-optimal', (data) => {
        if (socket !== currentExperiment.adminSocket) {
            console.log('非管理员尝试更新全局最优点');
            return;
        }
        
        // 检查是否是默认位置
        if (data.x === 400 && data.y === 300) {
            console.log('忽略默认位置更新请求');
            return;
        }
        
        console.log('更新全局最优点:', data);
        currentExperiment.globalOptimal = data;
        
        // 更新数据库中的全局最优点位置
        const updateGlobalOptimal = db.prepare(`
            UPDATE experiments 
            SET global_optimal_x = ?, global_optimal_y = ?
            WHERE id = ?
        `);
        
        try {
            const result = updateGlobalOptimal.run(
                currentExperiment.globalOptimal.x,
                currentExperiment.globalOptimal.y,
                currentExperiment.id
            );
            console.log('数据库更新结果:', result);
            
            // 验证更新是否成功
            const verifyUpdate = db.prepare(`
                SELECT global_optimal_x, global_optimal_y 
                FROM experiments 
                WHERE id = ?
            `).get(currentExperiment.id);
            
            console.log('验证数据库中的值:', verifyUpdate);
        } catch (error) {
            console.error('更新数据库时出错:', error);
        }
        
        // 重新计算所有参与者的信号值
        currentExperiment.participants.forEach((participant) => {
            participant.signalValue = calculateSignalValue(participant.position);
        });
        
        // 广播更新给所有客户端
        io.emit('global-optimal-update', {
            globalOptimal: currentExperiment.globalOptimal
        });
        
        // 广播更新后的参与者信号值
        currentExperiment.participants.forEach((participant) => {
            io.emit('player-update', {
                participantId: participant.id,
                name: participant.name,
                position: participant.position,
                signalValue: participant.signalValue
            });
        });
    });

    // 处理全局最优点随机变化请求
    socket.on('randomize-global-optimal', () => {
        if (socket !== currentExperiment.adminSocket) {
            console.log('非管理员尝试随机变化全局最优点');
            return;
        }
        
        console.log('收到随机化全局最优点请求');
        console.log('当前实验ID:', currentExperiment.id);
        
        const newGlobalOptimal = randomizeGlobalOptimal();
        console.log('全局最优点已随机变化:', newGlobalOptimal);
        
        // 广播更新给所有客户端
        io.emit('global-optimal-update', {
            globalOptimal: newGlobalOptimal
        });
        
        // 重新计算所有参与者的信号值
        currentExperiment.participants.forEach((participant) => {
            participant.signalValue = calculateSignalValue(participant.position);
        });
    });

    // 处理清除实验数据请求
    socket.on('clear-experiment-data', (data) => {
        if (socket !== currentExperiment.adminSocket) {
            console.log('非管理员尝试清除实验数据');
            return;
        }
        
        const { experimentId } = data;
        clearExperimentData(experimentId);
        
        // 发送确认消息
        socket.emit('experiment-data-cleared', { experimentId });
    });

    // 断开连接处理
    socket.on('disconnect', () => {
        // 如果是管理员断开连接
        if (socket === currentExperiment.adminSocket) {
            currentExperiment.adminSocket = null;
            return;
        }

        const participant = currentExperiment.participants.get(socket.id);
        if (participant) {
            // 广播参与者离开
            io.emit('participant-left', {
                participantId: participant.id
            });
            
            currentExperiment.participants.delete(socket.id);
            io.emit('participant-count', currentExperiment.participants.size);
        }
    });
});

// API路由
app.post('/api/experiments', (req, res) => {
    const { name } = req.body;
    const stmt = db.prepare('INSERT INTO experiments (name) VALUES (?)');
    const result = stmt.run(name);
    
    res.json({
        id: result.lastInsertRowid,
        name
    });
});

app.get('/api/experiments/:id/data', (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare(`
        SELECT 
            p.name as participant_name,
            m.x, m.y, m.signal_value, m.timestamp
        FROM movements m
        JOIN participants p ON m.participant_id = p.id
        WHERE p.experiment_id = ?
        ORDER BY m.timestamp
    `);
    
    const data = stmt.all(id);
    res.json(data);
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`服务器运行在 http://${HOST}:${PORT}`);
}); 