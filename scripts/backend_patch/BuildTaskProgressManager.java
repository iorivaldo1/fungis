package com.qskj.get_geo_pg.service;

import com.qskj.get_geo_pg.pojo.BuildTaskProgress;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 纯内存、高并发、零数据库锁争用的路网构建进度管理器
 * 遵循极低 CPU 消耗设计原则
 */
@Slf4j
@Service
public class BuildTaskProgressManager {

    private final Map<String, BuildTaskProgress> taskMap = new ConcurrentHashMap<>();

    /**
     * 创建并初始化构建任务
     */
    public BuildTaskProgress createTask(String taskId, String networkId, String networkName, String level, String mode) {
        cleanExpiredTasks();
        BuildTaskProgress progress = new BuildTaskProgress();
        progress.setTaskId(taskId);
        progress.setNetworkId(networkId);
        progress.setNetworkName(networkName);
        progress.setLevel(level);
        progress.setMode(mode);
        progress.setStatus("RUNNING");
        progress.setPercent(2);
        progress.setCurrentStep(1);
        progress.setStageTitle("正在准备构建环境...");
        progress.setStageDetail("正在校验行政区要素与数据库连接...");
        taskMap.put(taskId, progress);
        return progress;
    }

    /**
     * 更新阶段与百分比进度 (纳秒级纯内存操作，零锁无I/O)
     */
    public void updateProgress(String taskId, int percent, int currentStep, String stageTitle, String stageDetail) {
        BuildTaskProgress progress = taskMap.get(taskId);
        if (progress != null && !"SUCCESS".equals(progress.getStatus()) && !"FAILED".equals(progress.getStatus())) {
            progress.setPercent(Math.min(99, Math.max(0, percent)));
            progress.setCurrentStep(currentStep);
            progress.setStageTitle(stageTitle);
            progress.setStageDetail(stageDetail);
            progress.updateElapsed();
        }
    }

    /**
     * 标记任务成功
     */
    public void completeTask(String taskId, Map<String, Object> result) {
        BuildTaskProgress progress = taskMap.get(taskId);
        if (progress != null) {
            progress.setStatus("SUCCESS");
            progress.setPercent(100);
            progress.setCurrentStep(6);
            progress.setStageTitle("路网拓扑构建完成！");
            progress.setStageDetail("空间包围盒计算与路网注册就绪，可立即开启高速算路");
            progress.setResult(result);
            progress.updateElapsed();
            log.info("[BuildTask] 任务 {} 构建成功，耗时 {} 秒", taskId, progress.getElapsedSeconds());
        }
    }

    /**
     * 标记任务失败
     */
    public void failTask(String taskId, String errorMsg) {
        BuildTaskProgress progress = taskMap.get(taskId);
        if (progress != null) {
            progress.setStatus("FAILED");
            progress.setErrorMsg(errorMsg);
            progress.setStageTitle("构建失败");
            progress.setStageDetail("异常: " + errorMsg);
            progress.updateElapsed();
            log.error("[BuildTask] 任务 {} 构建失败: {}", taskId, errorMsg);
        }
    }

    /**
     * 获取任务当前进度
     */
    public BuildTaskProgress getProgress(String taskId) {
        BuildTaskProgress progress = taskMap.get(taskId);
        if (progress != null) {
            progress.updateElapsed();
        }
        return progress;
    }

    /**
     * 清理超过 30 分钟的已完结历史任务，防止内存溢出
     */
    private void cleanExpiredTasks() {
        long now = System.currentTimeMillis();
        taskMap.entrySet().removeIf(entry -> {
            BuildTaskProgress p = entry.getValue();
            boolean isDone = "SUCCESS".equals(p.getStatus()) || "FAILED".equals(p.getStatus());
            return isDone && (now - p.getUpdateTime() > 30 * 60 * 1000);
        });
    }
}
