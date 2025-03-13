const { v4: uuidv4 } = require('uuid');
const { saveExperimentData } = require('./dataManager');

class ExperimentManager {
    constructor() {
        this.experiments = new Map();
    }

    initializeExperiment(config) {
        const experimentId = uuidv4();
        const experiment = {
            id: experimentId,
            config: {
                mapWidth: config.mapWidth || 100,
                mapHeight: config.mapHeight || 100,
                perceptionRange: config.perceptionRange || 20,
                maxParticipants: config.maxParticipants || 10,
                duration: config.duration || 300000, // 默认5分钟
                signalFunction: config.signalFunction || 'default'
            },
            startTime: null,
            endTime: null,
            participants: new Map(),
            trajectories: new Map(),
            isActive: false
        };

        this.experiments.set(experimentId, experiment);
        return experimentId;
    }

    startExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) throw new Error('实验不存在');

        experiment.startTime = Date.now();
        experiment.isActive = true;

        // 设置实验结束定时器
        setTimeout(() => {
            this.endExperiment(experimentId);
        }, experiment.config.duration);

        return experiment;
    }

    endExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) throw new Error('实验不存在');

        experiment.endTime = Date.now();
        experiment.isActive = false;

        // 保存实验数据
        saveExperimentData(experimentId, {
            config: experiment.config,
            startTime: experiment.startTime,
            endTime: experiment.endTime,
            trajectories: Array.from(experiment.trajectories.entries()).map(([id, trajectory]) => ({
                participantId: id,
                positions: trajectory
            }))
        });

        return experiment;
    }

    recordPosition(experimentId, participantId, position, timestamp) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment || !experiment.isActive) return;

        if (!experiment.trajectories.has(participantId)) {
            experiment.trajectories.set(participantId, []);
        }

        experiment.trajectories.get(participantId).push({
            position,
            timestamp,
            signalValue: this.calculateSignalValue(position, experiment.config.signalFunction)
        });
    }

    calculateSignalValue(position, signalFunctionType) {
        // 可以根据不同的实验需求实现不同的信号函数
        switch (signalFunctionType) {
            case 'multiPeak':
                return this.multiPeakFunction(position);
            case 'singlePeak':
                return this.singlePeakFunction(position);
            default:
                return this.defaultFunction(position);
        }
    }

    defaultFunction(position) {
        const { x, y } = position;
        return Math.pow(x - 50, 2) + Math.pow(y - 50, 2);
    }

    singlePeakFunction(position) {
        const { x, y } = position;
        return 100 - Math.exp(-(Math.pow(x - 50, 2) + Math.pow(y - 50, 2)) / 100);
    }

    multiPeakFunction(position) {
        const { x, y } = position;
        return Math.sin(x/10) * Math.cos(y/10) + Math.pow((x-50)/30, 2) + Math.pow((y-50)/30, 2);
    }
}

const experimentManager = new ExperimentManager();
module.exports = experimentManager; 