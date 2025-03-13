const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// 创建数据库连接
const db = new sqlite3.Database(path.join(DATA_DIR, 'experiments.db'));

// 初始化数据库表
db.serialize(() => {
    // 实验表
    db.run(`CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        config TEXT,
        start_time INTEGER,
        end_time INTEGER,
        created_at INTEGER
    )`);

    // 轨迹数据表
    db.run(`CREATE TABLE IF NOT EXISTS trajectories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT,
        participant_id TEXT,
        position_x REAL,
        position_y REAL,
        signal_value REAL,
        timestamp INTEGER,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    )`);
});

class DataManager {
    // 保存实验数据
    saveExperimentData(experimentId, data) {
        const { config, startTime, endTime, trajectories } = data;

        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO experiments (id, config, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?)',
                [experimentId, JSON.stringify(config), startTime, endTime, Date.now()],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // 保存轨迹数据
                    const stmt = db.prepare(
                        'INSERT INTO trajectories (experiment_id, participant_id, position_x, position_y, signal_value, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
                    );

                    trajectories.forEach(trajectory => {
                        trajectory.positions.forEach(pos => {
                            stmt.run(
                                experimentId,
                                trajectory.participantId,
                                pos.position.x,
                                pos.position.y,
                                pos.signalValue,
                                pos.timestamp
                            );
                        });
                    });

                    stmt.finalize();
                    resolve();
                }
            );
        });
    }

    // 导出实验数据为CSV
    async exportExperimentData(experimentId) {
        return new Promise((resolve, reject) => {
            const experimentData = {
                config: null,
                trajectories: []
            };

            // 获取实验配置
            db.get(
                'SELECT * FROM experiments WHERE id = ?',
                [experimentId],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (!row) {
                        reject(new Error('实验不存在'));
                        return;
                    }

                    experimentData.config = JSON.parse(row.config);

                    // 获取轨迹数据
                    db.all(
                        'SELECT * FROM trajectories WHERE experiment_id = ? ORDER BY participant_id, timestamp',
                        [experimentId],
                        (err, rows) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            experimentData.trajectories = rows;

                            // 生成CSV文件
                            const csvPath = path.join(DATA_DIR, `experiment_${experimentId}.csv`);
                            const csvContent = this.generateCSV(experimentData);
                            
                            fs.writeFile(csvPath, csvContent, 'utf8', (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve(csvPath);
                            });
                        }
                    );
                }
            );
        });
    }

    // 生成CSV内容
    generateCSV(data) {
        const headers = [
            'participant_id',
            'timestamp',
            'position_x',
            'position_y',
            'signal_value'
        ].join(',');

        const rows = data.trajectories.map(t => 
            `${t.participant_id},${t.timestamp},${t.position_x},${t.position_y},${t.signal_value}`
        );

        return [headers, ...rows].join('\n');
    }

    // 清理旧数据
    async cleanupOldData(daysToKeep = 30) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM trajectories WHERE experiment_id IN (SELECT id FROM experiments WHERE created_at < ?)',
                [cutoffTime],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    db.run(
                        'DELETE FROM experiments WHERE created_at < ?',
                        [cutoffTime],
                        (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        }
                    );
                }
            );
        });
    }
}

const dataManager = new DataManager();
module.exports = dataManager; 