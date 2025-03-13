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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE TABLE IF NOT EXISTS movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id INTEGER,
        x REAL NOT NULL,
        y REAL NOT NULL,
        signal_value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (participant_id) REFERENCES participants(id)
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
    globalOptimal: { x: 400, y: 300 } // 默认全局最优点位置
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
    
    // 多峰函数 - 使用正弦和余弦函数创建多个局部最优点
    const frequency = 5; // 控制峰的数量
    const sineTerm = Math.sin(nx * frequency * Math.PI) * Math.sin(ny * frequency * Math.PI);
    
    // 添加一些随机的局部最优点
    const localPeaks = [
        { x: 0.2, y: 0.2, strength: 0.4 },
        { x: 0.8, y: 0.2, strength: 0.5 },
        { x: 0.2, y: 0.8, strength: 0.3 },
        { x: 0.8, y: 0.8, strength: 0.45 },
        { x: 0.5, y: 0.5, strength: 0.35 }
    ];
    
    let localInfluence = 0;
    for (const peak of localPeaks) {
        const lx = nx - peak.x;
        const ly = ny - peak.y;
        const distToPeak = Math.sqrt(lx*lx + ly*ly);
        localInfluence += peak.strength * Math.exp(-distToPeak * distToPeak / 0.03);
    }
    
    // 组合全局和局部影响
    // 全局最优点的影响更强，确保它是真正的全局最优
    const combinedInfluence = 0.8 * globalInfluence + 0.3 * sineTerm + 0.2 * localInfluence;
    
    // 转换为0-100范围的信号值，值越小表示越接近最优
    return 100 * (1 - combinedInfluence);
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
            // 确保实验记录存在
            const checkExperiment = db.prepare('SELECT id, perception_range FROM experiments WHERE id = ?').get(experimentId);
            if (!checkExperiment) {
                // 如果实验不存在，创建一个新的实验记录
                const createExperiment = db.prepare('INSERT INTO experiments (id, name, perception_range) VALUES (?, ?, ?)');
                createExperiment.run(experimentId, `Experiment ${experimentId}`, currentExperiment.perceptionRange);
            } else {
                currentExperiment.perceptionRange = checkExperiment.perception_range;
            }
            currentExperiment.id = experimentId;
            
            socket.emit('joined-experiment', {
                participantId: 'admin',
                experimentId: experimentId,
                isAdmin: true,
                perceptionRange: currentExperiment.perceptionRange,
                isRunning: currentExperiment.isRunning,
                startTime: currentExperiment.startTime,
                duration: currentExperiment.duration
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
            const stmt = db.prepare(`
                INSERT INTO movements (participant_id, x, y, signal_value)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(participant.id, x, y, signalValue);
        }

        // 广播位置更新给所有参与者
        io.emit('player-update', {
            participantId: participant.id,
            name: participant.name,
            position: participant.position,
            signalValue: participant.signalValue
        });
        
        console.log('广播位置更新:', {
            participantId: participant.id,
            name: participant.name,
            position: participant.position,
            signalValue: participant.signalValue
        });
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
        
        // 更新全局最优点位置
        if (data.globalOptimal) {
            currentExperiment.globalOptimal = data.globalOptimal;
            console.log('更新全局最优点位置:', currentExperiment.globalOptimal);
        }
        
        currentExperiment.isRunning = true;
        currentExperiment.startTime = Date.now();
        
        // 重新计算所有参与者的信号值
        currentExperiment.participants.forEach((participant) => {
            participant.signalValue = calculateSignalValue(participant.position);
        });
        
        console.log('实验开始:', {
            experimentId: data.experimentId,
            startTime: currentExperiment.startTime,
            perceptionRange: currentExperiment.perceptionRange,
            globalOptimal: currentExperiment.globalOptimal,
            participantCount: currentExperiment.participants.size
        });
        
        // 向所有客户端广播实验开始事件
        io.emit('experiment-start', {
            experimentId: data.experimentId,
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
                    experimentId: data.experimentId,
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

    // 管理员控制 - 导出数据
    socket.on('export-data', async (data) => {
        if (socket !== currentExperiment.adminSocket) return;
        
        const stmt = db.prepare(`
            SELECT 
                p.name as participant_name,
                m.x, m.y, m.signal_value,
                m.timestamp,
                e.name as experiment_name,
                e.perception_range
            FROM movements m
            JOIN participants p ON m.participant_id = p.id
            JOIN experiments e ON p.experiment_id = e.id
            WHERE p.experiment_id = ?
            ORDER BY m.timestamp
        `);
        
        const experimentData = stmt.all(data.experimentId);
        
        socket.emit('experiment-data', {
            experimentId: data.experimentId,
            data: experimentData
        });
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