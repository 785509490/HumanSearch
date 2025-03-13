const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { initializeExperiment } = require('./experimentManager');
const { saveExperimentData } = require('./dataManager');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// 当前活跃的实验会话
const activeExperiments = new Map();

// Socket.IO连接处理
io.on('connection', (socket) => {
    console.log('新用户连接:', socket.id);

    // 创建新实验
    socket.on('createExperiment', (config) => {
        const experimentId = initializeExperiment(config);
        activeExperiments.set(experimentId, {
            config,
            participants: new Map(),
            startTime: null,
            isActive: false
        });
        socket.emit('experimentCreated', { experimentId });
    });

    // 加入实验
    socket.on('joinExperiment', ({ experimentId, participantName }) => {
        const experiment = activeExperiments.get(experimentId);
        if (!experiment) {
            socket.emit('error', { message: '实验不存在' });
            return;
        }

        // 生成随机初始位置
        const position = {
            x: Math.random() * experiment.config.mapWidth,
            y: Math.random() * experiment.config.mapHeight
        };

        experiment.participants.set(socket.id, {
            name: participantName,
            position,
            signalValue: calculateSignalValue(position, experiment.config.signalFunction)
        });

        socket.join(experimentId);
        socket.emit('joined', {
            position,
            participants: Array.from(experiment.participants.values())
        });
        
        // 通知其他参与者
        socket.to(experimentId).emit('participantJoined', {
            id: socket.id,
            name: participantName,
            position
        });
    });

    // 更新位置
    socket.on('updatePosition', ({ experimentId, position }) => {
        const experiment = activeExperiments.get(experimentId);
        if (!experiment || !experiment.isActive) return;

        const participant = experiment.participants.get(socket.id);
        if (!participant) return;

        participant.position = position;
        participant.signalValue = calculateSignalValue(position, experiment.config.signalFunction);

        // 向感知范围内的参与者广播更新
        const nearbyParticipants = getNearbyParticipants(
            experiment.participants,
            position,
            experiment.config.perceptionRange
        );

        nearbyParticipants.forEach(nearbyId => {
            io.to(nearbyId).emit('participantUpdate', {
                id: socket.id,
                position,
                signalValue: participant.signalValue
            });
        });
    });

    // 断开连接处理
    socket.on('disconnect', () => {
        activeExperiments.forEach((experiment, experimentId) => {
            if (experiment.participants.has(socket.id)) {
                experiment.participants.delete(socket.id);
                io.to(experimentId).emit('participantLeft', { id: socket.id });
            }
        });
    });
});

// 辅助函数：计算信号值
function calculateSignalValue(position, signalFunction) {
    // 这里实现具体的信号函数，可以是多峰函数
    // 示例：二次函数
    const { x, y } = position;
    return Math.pow(x - 50, 2) + Math.pow(y - 50, 2);
}

// 辅助函数：获取感知范围内的参与者
function getNearbyParticipants(participants, position, range) {
    const nearby = [];
    participants.forEach((participant, id) => {
        const distance = Math.sqrt(
            Math.pow(participant.position.x - position.x, 2) +
            Math.pow(participant.position.y - position.y, 2)
        );
        if (distance <= range) {
            nearby.push(id);
        }
    });
    return nearby;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
}); 