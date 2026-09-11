package com.qskj.get_geo_pg.pojo;

import lombok.Data;
import java.util.Map;

/**
 * 针对路网构建任务的百分比进度领域模型 (低 CPU 消耗纯内存对象)
 */
@Data
public class BuildTaskProgress {
    private String taskId;
    private String networkId;
    private String networkName;
    private String level;
    private String mode; // "2d" | "3d"
    private String status; // "PENDING", "RUNNING", "SUCCESS", "FAILED"
    private int percent; // 0 - 100
    private String stageTitle; // 阶段名称，如 "[3/6] 道路拓扑打散 (pgr_nodeNetwork)"
    private String stageDetail; // 详细进度说明，如 "正在打散第 2 层道路弧段..."
    private int currentStep; // 当前阶段 (1 ~ 6)
    private int totalSteps; // 总阶段数 (6)
    private long startTime;
    private long updateTime;
    private long elapsedSeconds; // 运行时长（秒）
    private Map<String, Object> result; // 成功时返回的完整元数据（BBox、center等）
    private String errorMsg; // 异常报错信息

    public BuildTaskProgress() {
        this.status = "PENDING";
        this.percent = 0;
        this.currentStep = 1;
        this.totalSteps = 6;
        this.startTime = System.currentTimeMillis();
        this.updateTime = this.startTime;
        this.elapsedSeconds = 0;
    }

    public void updateElapsed() {
        this.elapsedSeconds = Math.max(0, (System.currentTimeMillis() - this.startTime) / 1000);
        this.updateTime = System.currentTimeMillis();
    }
}
