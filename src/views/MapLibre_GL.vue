<template>
  <div class="maplibre-container">
    <!-- 纯净全屏地图容器 -->
    <div id="map" ref="mapContainerRef"></div>

    <!-- 左上角独立 Zoom 缩放状态显示 -->
    <div id="zoomIndicator" class="zoom-badge-topleft">
      <span class="zoom-label">ZOOM</span>
      <span id="zoomValue" class="zoom-num">--</span>
    </div>

    <!-- 悬浮动画演进控制栏 -->
    <div id="animateCtrlBar" class="animate-ctrl-bar" style="display: none;">
      <div class="anim-bar-header">
        <div class="anim-bar-title-group">
          <span class="anim-title">A* 堆动画演进</span>
          <span id="animStateBadge" class="anim-badge anim-badge-idle">准备中</span>
        </div>
        <div class="anim-bar-stats">
          <span>步骤: <b id="animStepCur" style="color:#fbbf24;">0</b> / <span id="animStepTotal">0</span></span>
          <span class="anim-stat-sep">|</span>
          <span>节点: <span id="animNodeInfo" style="color:#38bdf8; font-family:monospace;">--</span></span>
          <button type="button" id="btnCloseAnimBar" class="anim-close-btn" title="关闭动画">&times;</button>
        </div>
      </div>
      <div class="anim-progress-track">
        <div id="animProgressBar" class="anim-progress-fill"></div>
      </div>
      <div class="anim-bar-body">
        <div class="anim-ctrl-group">
          <button type="button" id="btnAnimFirst" class="anim-ctrl-btn" title="跳转到第1步">第一步</button>
          <button type="button" id="btnAnimPrev" class="anim-ctrl-btn" title="上一步">上一步</button>
          <button type="button" id="btnAnimPlayPause" class="anim-ctrl-btn" title="暂停/播放">播放</button>
          <button type="button" id="btnAnimNext" class="anim-ctrl-btn" title="下一步">下一步</button>
          <button type="button" id="btnAnimLast" class="anim-ctrl-btn" title="跳转到最后一步">最后一步</button>
          <button type="button" id="btnAnimReplay" class="anim-ctrl-btn" title="从头重播">重播</button>
          <button type="button" id="btnAnimStop" class="anim-ctrl-btn btn-anim-stop" title="清除动画">清除</button>
        </div>
        <div class="anim-speed-group">
          <span>速度:</span>
          <input type="range" id="animSpeedRange" min="0" max="150" value="40" step="5">
          <span id="animSpeedVal" class="anim-speed-badge">40ms</span>
        </div>
        <div class="anim-legend-group">
          <span class="legend-item"><span class="legend-red-dot"></span> 出堆顶点</span>
          <span class="legend-item"><span class="legend-blue-dot"></span> 堆顶/已出堆</span>
          <span class="legend-item"><span class="legend-green-line"></span> 堆顶连线</span>
          <span class="legend-item"><span class="legend-gold-line"></span> 待拓展边</span>
          <span class="legend-item"><span class="legend-cyan-line"></span> 最优路径</span>
        </div>
      </div>
    </div>

    <!-- 左侧浮动智能导航指引抽屉面板 -->
    <div id="navDrawerPanel" class="nav-drawer-panel">
      <div class="nav-drawer-header">
        <div class="nav-header-left">
          <div>
            <div class="nav-drawer-title">路径导航指引</div>
            <div class="nav-drawer-subtitle" id="navTripSubtitle">正在分析路线拓扑...</div>
          </div>
        </div>
        <button type="button" class="nav-close-btn" id="btnCloseNavDrawer" title="收起面板">&times;</button>
      </div>

      <div class="nav-drawer-body">
        <div class="nav-steps-header">
          <span>分步指引详情</span>
          <span class="nav-step-counter" id="navStepProgressText">步骤 1 / --</span>
        </div>

        <div class="nav-step-ctrl-bar">
          <button type="button" class="nav-ctrl-btn" id="btnNavPrevStep">前一步</button>
          <button type="button" class="nav-ctrl-btn btn-curr" id="btnNavCurrStep">当前步</button>
          <button type="button" class="nav-ctrl-btn" id="btnNavNextStep">后一步</button>
        </div>

        <div class="nav-three-steps-list" id="navThreeStepsList">
          <div class="nav-loading-placeholder">
            <div class="nav-spinner"></div>
            <div>正在解析沿途路名与转向节点...</div>
          </div>
        </div>
      </div>

      <div class="nav-drawer-footer">
        <button type="button" class="nav-footer-btn btn-fit-route" id="btnNavFitRoute">全览路线</button>
        <button type="button" class="nav-footer-btn btn-close-nav" id="btnNavClose">收起指引</button>
      </div>
    </div>

    <!-- 路径规划控制面板 (极致极简扁平化科技风重构) -->
    <div class="route-panel" id="routePanel" style="display: none;">
      <!-- 1. 顶部操作栏：级别筛选微型胶囊 + 右侧极简收起按钮 -->
      <div class="panel-top-row">
        <div class="level-pill-group">
          <label class="level-radio-item" id="levelItemCity">
            <input type="radio" name="levelFilter" value="city">
            <span class="pill-text">市级</span>
          </label>
          <label class="level-radio-item active" id="levelItemCounty">
            <input type="radio" name="levelFilter" value="county" checked>
            <span class="pill-text">区县</span>
          </label>
          <label class="level-radio-item" id="levelItemTown">
            <input type="radio" name="levelFilter" value="town">
            <span class="pill-text">乡镇</span>
          </label>
          <label class="level-radio-item" id="levelItemVillage">
            <input type="radio" name="levelFilter" value="village">
            <span class="pill-text">街道</span>
          </label>
          <label class="level-radio-item" id="levelItemShp">
            <input type="radio" name="levelFilter" value="shp">
            <span class="pill-text">SHP</span>
          </label>
        </div>
        <span id="btnCloseRoutePanel" class="panel-close-btn" title="收起面板">&times;</span>
      </div>

      <!-- 2. 路网选择行：下拉选择 + 路网管理快捷按钮 -->
      <div class="network-select-row">
        <select id="selRoadNetwork" class="compact-select">
          <option value="">加载路网配置中...</option>
        </select>
        <button type="button" id="btnManageNetworks" class="btn-network-manage-icon" title="路网数据集管理">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          <span>路网</span>
        </button>
      </div>

      <!-- 3. 规划模式分段控制器 -->
      <div class="paradigm-segmented-bar">
        <div class="paradigm-item active" id="paradigm1to1">
          <span>1 对 1</span>
          <span class="sub-label">点对点</span>
        </div>
        <div class="paradigm-item" id="paradigm1toN">
          <span>1 对 N</span>
          <span class="sub-label">1起多终</span>
        </div>
        <div class="paradigm-item" id="paradigmNto1">
          <span>N 对 1</span>
          <span class="sub-label">多起1终</span>
        </div>
        <!-- 隐藏的旧 badge 保持 JS 兼容 -->
        <span id="paradigmBadge" style="display: none;">1 对 1</span>
      </div>

      <!-- 4. 起终点点选卡片 -->
      <div class="waypoints-direct-container">
        <!-- 起点选点行 (1:1 / 1:N) -->
        <div class="waypoint-click-row" id="groupSingleStart" title="在地图上点击选取起点">
          <div class="waypoint-row-left">
            <span class="waypoint-badge start">起</span>
            <span class="waypoint-text" id="textStartCoord">在地图上点击选起点</span>
          </div>
          <button type="button" id="btnPickStart" class="btn-waypoint-pick" title="在地图上点选起点">地图选点</button>
          <span id="labelSingleStart" style="display: none;">起点</span>
        </div>

        <!-- 终点选点行 (1:1 / N:1) -->
        <div class="waypoint-click-row" id="groupSingleEnd" title="在地图上点击选取终点">
          <div class="waypoint-row-left">
            <span class="waypoint-badge end">终</span>
            <span class="waypoint-text" id="textEndCoord">在地图上点击选终点</span>
          </div>
          <button type="button" id="btnPickEnd" class="btn-waypoint-pick" title="在地图上点选终点">地图选点</button>
          <span id="labelSingleEnd" style="display: none;">终点</span>
        </div>

        <!-- 快捷工具栏：互换起终点 + 弹出坐标输入框按钮 -->
        <div class="waypoint-toolbar-row">
          <button type="button" id="btnSwapWaypoints" class="btn-waypoint-tool" title="互换起点和终点">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 10 12 15 17 10"></polyline>
              <polyline points="17 14 12 9 7 14"></polyline>
            </svg>
            <span>互换起终点</span>
          </button>
          <button type="button" id="btnOpenCoordModal" class="btn-waypoint-tool" title="弹出精确输入经纬度坐标">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
              <line x1="3" y1="9" x2="21" y2="9"></line>
            </svg>
            <span>输入坐标</span>
          </button>
        </div>
      </div>

      <!-- 弹出式坐标精确输入浮层 -->
      <div id="coordInputModal" class="coord-input-modal" style="display: none;">
        <div class="coord-modal-header">
          <span class="coord-modal-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="22" y1="12" x2="18" y2="12"></line>
              <line x1="6" y1="12" x2="2" y2="12"></line>
              <line x1="12" y1="6" x2="12" y2="2"></line>
              <line x1="12" y1="22" x2="12" y2="18"></line>
            </svg>
            输入起终点坐标
          </span>
          <span id="btnCloseCoordModal" class="coord-modal-close" title="关闭">&times;</span>
        </div>
        <div class="coord-modal-body">
          <div class="coord-input-group">
            <div class="coord-group-label">
              <span class="waypoint-badge start" style="width:14px;height:14px;font-size:9px;">起</span>
              <span>起点坐标 (经度, 纬度)</span>
            </div>
            <div class="coord-inputs-row">
              <input type="text" inputmode="decimal" id="startLng" class="compact-coord-input" placeholder="经度">
              <span class="coord-split">,</span>
              <input type="text" inputmode="decimal" id="startLat" class="compact-coord-input" placeholder="纬度">
            </div>
          </div>
          <div class="coord-input-group">
            <div class="coord-group-label">
              <span class="waypoint-badge end" style="width:14px;height:14px;font-size:9px;">终</span>
              <span>终点坐标 (经度, 纬度)</span>
            </div>
            <div class="coord-inputs-row">
              <input type="text" inputmode="decimal" id="endLng" class="compact-coord-input" placeholder="经度">
              <span class="coord-split">,</span>
              <input type="text" inputmode="decimal" id="endLat" class="compact-coord-input" placeholder="纬度">
            </div>
          </div>
        </div>
        <div class="coord-modal-footer">
          <button type="button" id="btnClearCoordInputs" class="btn-coord-clear">清空</button>
          <button type="button" id="btnConfirmCoordModal" class="btn-coord-confirm">确定选点</button>
        </div>
      </div>

      <!-- 多起点管理容器 (N:1 显示，默认隐藏) -->
      <div class="form-group" id="groupMultiOrigins" style="display: none;">
        <div class="form-label compact-label">
          <span>起点集合 (<b id="origPointsCount" style="color:#10b981;">0</b> 个)</span>
          <button type="button" id="btnClearOrigins" class="btn-multi-clear">清空</button>
        </div>
        <div class="multi-action-bar">
          <button type="button" id="btnContinuousPickOrigins" class="btn-multi-pick">
            <span>+ 连续在地图选起点</span>
          </button>
        </div>
        <div class="multi-points-card" id="origPointsList">
          <div class="empty-points-tip">暂未添加起点，点击上方按钮选点</div>
        </div>
      </div>

      <!-- 多终点管理容器 (1:N 显示，默认隐藏) -->
      <div class="form-group" id="groupMultiDestinations" style="display: none;">
        <div class="form-label compact-label">
          <span>终点集合 (<b id="destPointsCount" style="color:#38bdf8;">0</b> 个)</span>
          <button type="button" id="btnClearDests" class="btn-multi-clear">清空</button>
        </div>
        <div class="multi-action-bar">
          <button type="button" id="btnContinuousPickDests" class="btn-multi-pick">
            <span>+ 连续在地图选终点</span>
          </button>
        </div>
        <div class="multi-points-card" id="destPointsList">
          <div class="empty-points-tip">暂未添加终点，点击上方按钮选点</div>
        </div>
      </div>

      <!-- 5. 底部操作按钮行：直接对齐并列 (规划路径 / 分析演进 / 重置) -->
      <div class="route-panel-actions">
        <button type="button" id="btnPlanRoute" class="btn-primary-plan">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>开始规划路径</span>
        </button>
        <button type="button" id="btnAnimateRoute" class="btn-secondary-animate" title="单路径 A* 堆拓展演进分析">
          <span>分析演进</span>
        </button>
        <button type="button" id="btnResetRoute" class="btn-tertiary-reset" title="重置清空">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
        </button>
      </div>

      <!-- 6. 路线显隐与规划结果模块 (点击“开始规划路径”后才动态出现) -->
      <div id="routeResultSection" class="route-result-section" style="display: none;">
        <!-- 路线显隐状态栏 -->
        <div class="route-status-bar">
          <label class="compact-toggle-item" title="显示或隐藏地图上的规划路径">
            <input type="checkbox" id="chkShowRoute" checked>
            <span class="status-dot"></span>
            <span class="status-label">显示规划路径</span>
          </label>
        </div>

        <!-- HUD 仪表风格卡片 -->
        <div id="resultCard" class="result-card-compact">
          <div class="result-compact-header">
            <span class="res-status-tag" id="resStatus">未运行</span>
            <span class="res-nodes-text" id="rowNodes">
              <span id="resNodes">-- → --</span>
            </span>
          </div>
          <div class="result-compact-body" id="rowDistance">
            <div class="res-metric-item">
              <span class="metric-label">全线里程:</span>
              <span class="metric-val" id="resDistance">-- km</span>
            </div>
            <div class="res-metric-action" id="rowNavAction" style="display: none;">
              <button type="button" id="btnOpenNavDrawer" class="btn-nav-compact">
                <span>导航指引</span>
                <span class="arrow-ico">➔</span>
              </button>
            </div>
          </div>

          <!-- 多路线汇总与列表 -->
          <div id="multiRouteStats" style="display: none;">
            <div class="multi-stat-summary">
              <span>规划路线: <b id="resMultiCount" style="color: #38bdf8;">0</b> 条</span>
            </div>
            <div id="multiRouteList" class="multi-route-card-list"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== fungis 浮动弹出控制面板集合 (统一网格与暗黑玻璃态) ==================== -->
    <!-- 1. 点击查询面板 -->
    <div id="panelClickInfo" class="fungis-popup-panel" style="display: none;">
      <div class="fungis-panel-header">
        <span class="fungis-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="22" y1="12" x2="18" y2="12"></line>
            <line x1="6" y1="12" x2="2" y2="12"></line>
            <line x1="12" y1="6" x2="12" y2="2"></line>
            <line x1="12" y1="22" x2="12" y2="18"></line>
          </svg>
          坐标点击查询
        </span>
        <span class="fungis-panel-close" title="收起">&times;</span>
      </div>
      <div class="fungis-panel-body">
        <div class="click-toggle-bar">
          <span>开启地图点击拾取</span>
          <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
            <input type="checkbox" id="chkClickInfoActive">
            <span style="color:#38bdf8; font-weight:600;">启用拾取</span>
          </label>
        </div>
        <div class="click-info-grid">
          <div class="click-info-item">
            <div class="click-info-label">WGS84 经度</div>
            <div id="valWgsLng" class="click-info-val">--</div>
          </div>
          <div class="click-info-item">
            <div class="click-info-label">WGS84 纬度</div>
            <div id="valWgsLat" class="click-info-val">--</div>
          </div>
          <div class="click-info-item">
            <div class="click-info-label">BD09 经度</div>
            <div id="valBdLng" class="click-info-val">--</div>
          </div>
          <div class="click-info-item">
            <div class="click-info-label">BD09 纬度</div>
            <div id="valBdLat" class="click-info-val">--</div>
          </div>
          <div class="click-info-item full-width">
            <div class="click-info-label">CGCS2000 分带</div>
            <div id="valProjZone" class="click-info-val">--</div>
          </div>
          <div class="click-info-item">
            <div class="click-info-label">高斯投影 X (东向)</div>
            <div id="valProjX" class="click-info-val">--</div>
          </div>
          <div class="click-info-item">
            <div class="click-info-label">高斯投影 Y (北向)</div>
            <div id="valProjY" class="click-info-val">--</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 坐标定位面板 -->
    <div id="panelLocate" class="fungis-popup-panel" style="display: none;">
      <div class="fungis-panel-header">
        <span class="fungis-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          多系坐标定位
        </span>
        <span class="fungis-panel-close" title="收起">&times;</span>
      </div>
      <div class="fungis-panel-body">
        <div class="fungis-form-row">
          <span class="fungis-form-label">坐标系:</span>
          <select id="locateCrsSelect" class="fungis-select">
            <option value="WGS84" selected>WGS84 (经纬度)</option>
            <option value="BD09">BD09 (百度坐标)</option>
            <option value="CGCS2000">CGCS2000 投影</option>
          </select>
        </div>
        <div class="fungis-form-row" id="rowLocateFormat">
          <span class="fungis-form-label">格 式:</span>
          <select id="locateFormatSelect" class="fungis-select">
            <option value="degree" selected>度 (DD)</option>
            <option value="dms">度分秒 (DMS)</option>
          </select>
        </div>
        <div class="fungis-form-row" id="rowLocateZone" style="display: none;">
          <span class="fungis-form-label">分带号:</span>
          <select id="locateZoneSelect" class="fungis-select">
            <option value="25">25带 (中央经线 75°)</option>
            <option value="26">26带 (中央经线 78°)</option>
            <option value="27">27带 (中央经线 81°)</option>
            <option value="28">28带 (中央经线 84°)</option>
            <option value="29">29带 (中央经线 87°)</option>
            <option value="30">30带 (中央经线 90°)</option>
            <option value="31">31带 (中央经线 93°)</option>
            <option value="32">32带 (中央经线 96°)</option>
            <option value="33">33带 (中央经线 99°)</option>
            <option value="34" selected>34带 (中央经线 102°)</option>
            <option value="35">35带 (中央经线 105°)</option>
            <option value="36">36带 (中央经线 108°)</option>
            <option value="37">37带 (中央经线 111°)</option>
            <option value="38">38带 (中央经线 114°)</option>
            <option value="39">39带 (中央经线 117°)</option>
            <option value="40">40带 (中央经线 120°)</option>
            <option value="41">41带 (中央经线 123°)</option>
            <option value="42">42带 (中央经线 126°)</option>
            <option value="43">43带 (中央经线 129°)</option>
            <option value="44">44带 (中央经线 132°)</option>
            <option value="45">45带 (中央经线 135°)</option>
          </select>
        </div>
        <div id="rowLocateDecimal" style="display: flex; flex-direction: column; gap: 8px;">
          <div class="fungis-form-row">
            <span class="fungis-form-label" id="lblCoordX">经度:</span>
            <input type="number" step="any" id="locateCoordX" class="fungis-input" placeholder="输入经度或 X 坐标">
          </div>
          <div class="fungis-form-row">
            <span class="fungis-form-label" id="lblCoordY">纬度:</span>
            <input type="number" step="any" id="locateCoordY" class="fungis-input" placeholder="输入纬度或 Y 坐标">
          </div>
        </div>
        <div id="rowLocateDmsX" class="fungis-form-row" style="display: none;">
          <span class="fungis-form-label">经度:</span>
          <div class="fungis-dms-row">
            <input type="number" id="dmsXdeg" class="fungis-dms-input" placeholder="度">°
            <input type="number" id="dmsXmin" class="fungis-dms-input" placeholder="分">'
            <input type="number" step="0.01" id="dmsXsec" class="fungis-dms-input" placeholder="秒">"
          </div>
        </div>
        <div id="rowLocateDmsY" class="fungis-form-row" style="display: none;">
          <span class="fungis-form-label">纬度:</span>
          <div class="fungis-dms-row">
            <input type="number" id="dmsYdeg" class="fungis-dms-input" placeholder="度">°
            <input type="number" id="dmsYmin" class="fungis-dms-input" placeholder="分">'
            <input type="number" step="0.01" id="dmsYsec" class="fungis-dms-input" placeholder="秒">"
          </div>
        </div>
      </div>
      <div class="fungis-panel-footer">
        <button type="button" id="btnClearLocateForm" class="fungis-btn-secondary">清空</button>
        <button type="button" id="btnDoLocate" class="fungis-btn-primary">开始定位</button>
      </div>
    </div>

    <!-- 3. 定位结果表格面板 -->
    <div id="panelLocationTable" class="fungis-popup-panel panel-wide" style="display: none;">
      <div class="fungis-panel-header">
        <span class="fungis-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path
              d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18">
            </path>
          </svg>
          定位结果列表
        </span>
        <span class="fungis-panel-close" title="收起">&times;</span>
      </div>
      <div class="fungis-panel-body">
        <div class="location-table-container">
          <table class="location-table">
            <thead>
              <tr>
                <th style="width: 50px;">ID</th>
                <th>坐标 (经度, 纬度)</th>
                <th class="col-actions" style="width: 80px;">操作</th>
              </tr>
            </thead>
            <tbody id="locationTableBody">
              <tr>
                <td colspan="3" style="text-align:center;color:#64748b;padding:16px;">暂无定位点数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="fungis-panel-footer">
        <button type="button" id="btnClearAllLocations" class="fungis-btn-danger">清空所有标记</button>
      </div>
    </div>

    <!-- 4. SHP 矢量数据面板 -->
    <div id="panelShpPanel" class="fungis-popup-panel panel-wide" style="display: none;">
      <div class="fungis-panel-header">
        <span class="fungis-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
          </svg>
          SHP 矢量图层管理
        </span>
        <span class="fungis-panel-close" title="收起">&times;</span>
      </div>
      <div class="fungis-panel-body">
        <div id="shpDropBox" class="fungis-upload-box">
          <div class="upload-box-actions">
            <button type="button" id="btnTriggerShpFile" class="fungis-btn-secondary">选择 .shp / .zip</button>
            <button type="button" id="btnTriggerShpFolder" class="fungis-btn-secondary">选择文件夹</button>
          </div>
          <div class="upload-box-hint">或将 .shp / .dbf / .zip 文件或文件夹拖拽至此处</div>
        </div>
        <div class="layer-items-list" id="shpLayerList">
          <div style="text-align:center;color:#64748b;font-size:11.5px;padding:8px;">暂无加载图层</div>
        </div>
      </div>
      <div class="fungis-panel-footer">
        <button type="button" id="btnClearAllShp" class="fungis-btn-danger">清空全部图层</button>
      </div>
    </div>

    <!-- 5. JSON / GeoJSON 数据面板 -->
    <div id="panelJsonPanel" class="fungis-popup-panel panel-wide" style="display: none;">
      <div class="fungis-panel-header">
        <span class="fungis-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          JSON / GeoJSON 图层管理
        </span>
        <span class="fungis-panel-close" title="收起">&times;</span>
      </div>
      <div class="fungis-panel-body">
        <div id="jsonDropBox" class="fungis-upload-box">
          <div class="upload-box-actions">
            <button type="button" id="btnTriggerJsonFile" class="fungis-btn-secondary">选择 .json / .geojson</button>
            <button type="button" id="btnTriggerJsonFolder" class="fungis-btn-secondary">选择文件夹</button>
          </div>
          <div class="upload-box-hint">或将 GeoJSON/JSON 文件或文件夹拖拽至此处</div>
        </div>
        <div class="layer-items-list" id="jsonLayerList">
          <div style="text-align:center;color:#64748b;font-size:11.5px;padding:8px;">暂无加载图层</div>
        </div>
      </div>
      <div class="fungis-panel-footer">
        <button type="button" id="btnClearAllJson" class="fungis-btn-danger">清空全部图层</button>
      </div>
    </div>

    <!-- 6. 空间几何量算面板 -->
    <div id="panelMeasurePanel" class="fungis-popup-panel" style="display: none;">
      <div class="fungis-panel-header">
        <span class="fungis-panel-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12h20M6 12v-3M10 12v-4M14 12v-3M18 12v-4"></path>
          </svg>
          地图空间几何量算
        </span>
        <span class="fungis-panel-close" title="收起">&times;</span>
      </div>
      <div class="fungis-panel-body">
        <div class="measure-actions-grid">
          <button type="button" id="btnMeasureDistance" class="measure-btn" title="点击开始折线测距">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 20 10 8 16 16 22 4"></polyline>
            </svg>
            <span>测距</span>
          </button>
          <button type="button" id="btnMeasureArea" class="measure-btn" title="点击开始多边形测面">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 3 4 9 7 21 17 21 20 9"></polygon>
            </svg>
            <span>测面</span>
          </button>
          <button type="button" id="btnMeasureClear" class="measure-btn" title="清除全部量算标注" style="color:#f87171;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>清除</span>
          </button>
        </div>
        <div id="measureTipText" class="measure-tip-box">
          选择上方测距或测面工具开始测量。
        </div>
      </div>
    </div>

    <!-- 7. 照片预览全屏浮层与隐藏文件输入框 -->
    <div id="modalPhotoPreview" class="photo-preview-modal">
      <div class="photo-preview-header">
        <span id="photoPreviewTitle" style="font-weight:600; font-size:13px; color:#38bdf8;">照片信息预览</span>
        <span id="btnClosePhotoPreview" class="fungis-panel-close">&times;</span>
      </div>
      <div class="photo-preview-img-wrap">
        <img id="photoPreviewImg" src="" alt="照片预览">
      </div>
      <div id="photoPreviewMeta" class="photo-preview-meta"></div>
    </div>

    <!-- 隐藏的文件选择器 -->
    <input type="file" id="photoFileInputGeneral" style="display: none;" accept="image/*" multiple>
    <input type="file" id="shpFileInput" style="display: none;" accept=".shp,.dbf,.prj,.shx,.cpg,.zip" multiple>
    <input type="file" id="shpFolderInputGeneral" style="display: none;" webkitdirectory directory multiple>
    <input type="file" id="jsonFileInput" style="display: none;" accept=".json,.geojson,.topojson" multiple>
    <input type="file" id="jsonFolderInputGeneral" style="display: none;" webkitdirectory directory multiple>

    <!-- 地图底部左侧浮动控件容器 -->
    <div class="map-bottom-controls">
      <!-- 1. 新增功能圆形按钮组 -->
      <div class="fungis-btn-group">
        <!-- 点击拾取查询 -->
        <button type="button" id="btnClickInfo" class="btn-circle-tool" title="坐标点击查询">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="22" y1="12" x2="18" y2="12"></line>
            <line x1="6" y1="12" x2="2" y2="12"></line>
            <line x1="12" y1="6" x2="12" y2="2"></line>
            <line x1="12" y1="22" x2="12" y2="18"></line>
          </svg>
        </button>

        <!-- 坐标精准定位 -->
        <button type="button" id="btnLocate" class="btn-circle-tool" title="多系坐标定位">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </button>

        <!-- 定位结果表格 -->
        <button type="button" id="btnLocationTable" class="btn-circle-tool" title="定位结果列表">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path
              d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18">
            </path>
          </svg>
          <span id="btnLocTableBadge" class="btn-badge-count" style="display: none;">0</span>
        </button>

        <!-- SHP 矢量导入 -->
        <button type="button" id="btnShpPanel" class="btn-circle-tool" title="SHP 矢量图层管理">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
          </svg>
        </button>

        <!-- JSON 矢量导入 -->
        <button type="button" id="btnJsonPanel" class="btn-circle-tool" title="JSON/GeoJSON 图层管理">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </button>

        <!-- 空间测量 -->
        <button type="button" id="btnMeasurePanel" class="btn-circle-tool" title="空间几何量算">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12h20M6 12v-3M10 12v-4M14 12v-3M18 12v-4"></path>
          </svg>
        </button>

        <!-- 照片 GPS 上传 -->
        <button type="button" id="btnPhotoUpload" class="btn-circle-tool" title="照片 EXIF GPS 空间定位">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
        </button>

        <!-- 当前设备定位 -->
        <button type="button" id="btnCurrentLoc" class="btn-circle-tool" title="定位到当前设备位置">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
        </button>
      </div>

      <!-- 2. 独立图层控制组件 -->
      <div id="layerControlContainer" class="layer-control-container">
        <div id="layerControlPanel" class="layer-control-panel" style="display: none;">
          <div class="layer-panel-header">
            <span class="layer-panel-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
              图层控制
            </span>
            <span id="btnCloseLayerPanel" class="layer-panel-close" title="收起">&times;</span>
          </div>
          <div class="layer-panel-body">
            <label class="layer-toggle-item">
              <input type="checkbox" id="chkShowRoads" checked>
              <span class="layer-item-content">
                <span class="layer-color-dot" style="background: #fbbf24; box-shadow: 0 0 6px #fbbf24;"></span>
                <span class="layer-label-text">叠加 WMTS 背景道路切片</span>
              </span>
            </label>
          </div>
        </div>
        <button type="button" id="btnToggleLayerControl" class="btn-circle-tool" title="图层控制">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </button>
      </div>

      <!-- 3. 独立路径规划控制按钮 -->
      <button type="button" id="btnToggleRoutePanel" class="btn-circle-tool" title="路径规划面板">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="19" r="3"></circle>
          <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path>
          <circle cx="18" cy="5" r="3"></circle>
        </svg>
      </button>

      <!-- 4. 独立底图控制浮标 -->
      <div id="baseMapControlBar" class="basemap-control-bar">
        <label class="basemap-check-wrap" title="显示/隐藏矢量底图">
          <input type="checkbox" id="chkShowBaseMap" checked>
        </label>
        <div id="pbfThemeGroup" class="pbf-theme-group">
          <button type="button" class="pbf-style-btn" data-theme="dark">暗黑</button>
          <button type="button" class="pbf-style-btn active" data-theme="standard">标准</button>
          <button type="button" class="pbf-style-btn" data-theme="plain">素色</button>
        </div>
      </div>
    </div>

    <!-- 路网管理 Modal 弹窗 -->
    <div id="manageModal" class="modal-overlay" style="display: none;">
      <div class="modal-content manage-modal-width">
        <div class="modal-header">
          <span class="modal-title">数据库路网数据集管理</span>
          <span id="btnCloseManageModal" class="modal-close">&times;</span>
        </div>
        <div class="modal-body max-modal-body">
          <div class="manage-sub-header">
            <span class="sub-header-desc">路网编辑与维护：</span>
            <div class="manage-header-actions">
              <button type="button" id="btnOpenUploadFolder" class="pick-btn btn-sm btn-upload-shp-badge">
                + 上传 SHP 文件夹
              </button>
              <button type="button" id="btnOpenUploadFiles" class="pick-btn btn-sm btn-upload-shp-badge">
                + 多选 4 项 SHP 文件
              </button>
              <button type="button" id="btnOpenXzqFromManage" class="pick-btn btn-sm">
                + 相交新建路网
              </button>
            </div>
          </div>
          <div class="level-radio-group manage-level-radio">
            <label class="level-radio-item">
              <input type="radio" name="manageLevelFilter" value="city">
              <span class="radio-dot"></span>
              <span class="radio-text">市级</span>
            </label>
            <label class="level-radio-item active">
              <input type="radio" name="manageLevelFilter" value="county" checked>
              <span class="radio-dot"></span>
              <span class="radio-text">区县</span>
            </label>
            <label class="level-radio-item">
              <input type="radio" name="manageLevelFilter" value="town">
              <span class="radio-dot"></span>
              <span class="radio-text">乡镇</span>
            </label>
            <label class="level-radio-item">
              <input type="radio" name="manageLevelFilter" value="village">
              <span class="radio-dot"></span>
              <span class="radio-text">街道</span>
            </label>
            <label class="level-radio-item">
              <input type="radio" name="manageLevelFilter" value="shp">
              <span class="radio-dot"></span>
              <span class="radio-text">SHP</span>
            </label>
            <label class="level-radio-item">
              <input type="radio" name="manageLevelFilter" value="all">
              <span class="radio-dot"></span>
              <span class="radio-text">全部</span>
            </label>
          </div>
          <table class="manage-table">
            <thead>
              <tr>
                <th style="width: 26%;">路网 ID</th>
                <th style="width: 32%;">显示名称 (可编辑)</th>
                <th style="width: 18%;">文件规模</th>
                <th style="width: 24%; text-align: center;">操作</th>
              </tr>
            </thead>
            <tbody id="manageTableBody"></tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button type="button" id="btnCloseManageModalBtn" class="btn-reset">关闭</button>
        </div>
      </div>
    </div>

    <!-- 行政区划相交新建路网 Modal -->
    <div id="xzqModal" class="modal-overlay" style="display: none;">
      <div class="modal-content manage-modal-width">
        <div class="modal-header">
          <span class="modal-title">行政区划相交新建路网</span>
          <span id="btnCloseXzqModal" class="modal-close">&times;</span>
        </div>
        <div class="modal-body max-modal-body">
          <div class="form-group">
            <label class="form-label">选择行政层级</label>
            <div id="xzqLevelBtnContainer" class="xzq-level-container"></div>
            <div id="existingFilterTip" class="existing-filter-tip" style="display: none;"></div>
          </div>

          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">选择行政区划要素</label>
            <input type="text" id="xzqSearchInput" class="coord-input full-width-input" placeholder="输入关键字快速搜索匹配...">
            <div id="xzqListWrapper" class="xzq-list-wrapper"></div>
            <div id="selectedSummaryBar" class="selected-summary-bar" style="display: none;">
              <span class="summary-label">已选择：</span>
              <span id="summaryValue" class="summary-value"></span>
            </div>
          </div>

          <div id="xzqMsg" class="upload-msg" style="display: none;"></div>
        </div>
        <div class="modal-footer">
          <button type="button" id="btnCloseXzqModalBtn" class="btn-reset" style="margin-right: 10px;">取消</button>
          <button type="button" id="btnSubmitXzqBuild" class="btn-submit">开始相交构建路网</button>
        </div>
      </div>
    </div>

    <!-- 上传 SHP 新建路网 Modal (支持文件夹与多选文件双模式) -->
    <div id="uploadModal" class="modal-overlay" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title">上传 SHP 新建路网 (PGRB V3)</span>
          <span id="btnCloseUploadModal" class="modal-close">&times;</span>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">选择上传模式</label>
            <div class="upload-mode-toggle">
              <button type="button" id="btnModeFolder" class="upload-mode-btn active">方案 1：选择 SHP 文件夹</button>
              <button type="button" id="btnModeFiles" class="upload-mode-btn">方案 2：多选 4 项文件</button>
            </div>
          </div>

          <div id="groupUploadFolder" class="form-group" style="margin-top: 12px;">
            <label class="form-label">选择包含 Shapefile 的本地文件夹 (.shp, .dbf, .shx, .prj)</label>
            <input type="file" id="shpFolderInput" class="coord-input full-width-input" webkitdirectory directory
              multiple>
            <div class="input-sub-tip">提示：直接选中包含 Shapefile 的目录，系统自动匹配提取所有相关文件</div>
          </div>

          <div id="groupUploadFiles" class="form-group" style="display: none; margin-top: 12px;">
            <label class="form-label">多选 4 项核心文件 (按住 Ctrl 或 Shift 键)</label>
            <input type="file" id="shpFilesInput" class="coord-input full-width-input" multiple
              accept=".shp,.dbf,.shx,.prj,.cpg,.sbn,.sbx">
            <div class="input-sub-tip">必须同时包含 4 个基本格式：<strong>.shp</strong> (几何)、<strong>.dbf</strong>
              (属性)、<strong>.shx</strong> (索引)、<strong>.prj</strong> (投影)</div>
          </div>

          <div id="shpFilesSummary" class="shp-files-summary"
            style="font-size: 11.5px; color: #38bdf8; margin-top: 8px; display: none;"></div>

          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">路网唯一标识 Code (英文字母、数字或下划线)</label>
            <input type="text" id="netIdInput" class="coord-input full-width-input"
              placeholder="例如: shp_cd_road 或 cd_road">
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">路网显示名称</label>
            <input type="text" id="netNameInput" class="coord-input full-width-input" placeholder="例如: 成都道路网 (SHP)">
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">属性表字符编码</label>
            <select id="netEncodingInput" class="coord-input full-width-input">
              <option value="GBK" selected>GBK (推荐，大多数国内国测标准矢量)</option>
              <option value="UTF-8">UTF-8</option>
            </select>
          </div>
          <div id="uploadMsg" class="upload-msg" style="display: none;"></div>
        </div>
        <div class="modal-footer">
          <button type="button" id="btnCloseUploadModalBtn" class="btn-reset" style="margin-right: 10px;">取消</button>
          <button type="button" id="btnSubmitUpload" class="btn-submit">上传并编译为 V3 路网</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getLocalMaxZoom, getLocalMaxZoomSync } from '@/utils/mapConfig.js'

const mapContainerRef = ref(null)
let mapInstance = null
let resizeHandler = null
let middleMouseDownHandler = null
let mouseMoveHandler = null
let mouseUpHandler = null

// 资源按需动态加载器
const loadCss = (href) => {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      return resolve()
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = resolve
    link.onerror = resolve
    document.head.appendChild(link)
  })
}

const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve()
    }
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = (e) => reject(new Error(`加载脚本失败: ${src}`))
    document.head.appendChild(script)
  })
}

// 预加载所有雪碧图 SVG 图标 (通过 Canvas 转为 ImageData 栅格像素，规避 MapLibre 不支持直接使用 SVG DOM 报错)
const decodedImagesMap = new Map()

function preloadAllIcons() {
  if (!window.SPRITE_ICONS || !Array.isArray(window.SPRITE_ICONS.data)) {
    return Promise.resolve()
  }
  const promises = window.SPRITE_ICONS.data.map(item => {
    if (!item.name || !item.content) return null
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width || 32
          const height = img.naturalHeight || img.height || 32
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          const imageData = ctx.getImageData(0, 0, width, height)
          decodedImagesMap.set(item.name, imageData)
        } catch (e) {
          decodedImagesMap.set(item.name, img)
        }
        resolve()
      }
      img.onerror = () => resolve()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item.content)
    })
  }).filter(Boolean)

  return Promise.all(promises)
}

function addAllDecodedImagesToMap(targetMap) {
  if (!targetMap) return
  decodedImagesMap.forEach((img, name) => {
    if (!targetMap.hasImage(name)) {
      try {
        targetMap.addImage(name, img, { pixelRatio: 2 })
      } catch (e) { }
    }
  })
}

onMounted(async () => {
  try {
    // 1. 注入 CSS 样式表
    await Promise.all([
      loadCss('/Public/lib/maplibre-gl/maplibre-gl.css'),
      loadCss('/Public/lib/maplibre-gl/pgrb_route_ui.css'),
      loadCss('/Public/lib/maplibre-gl/fungis_maplibre_tools.css')
    ])

    // 2. 依次按依赖顺序加载 JS 库
    const scriptList = [
      '/Public/js/jquery-3.7.1.min.js',
      '/Public/js/proj4.js',
      '/Public/js/coordTransUtills.js',
      '/Public/js/shp.min.js',
      '/Public/js/turf.min.js',
      '/Public/js/exif.js',
      '/Public/js/boundary_route_decode.js',
      '/Public/lib/maplibre-gl/maplibre-gl.js',
      '/Public/lib/maplibre-gl/smgi_styles.js',
      '/Public/lib/maplibre-gl/sprite_icons.js',
      '/Public/js/mlgl_shader.js',
      '/Public/js/pgrb_route_manager.js',
      '/Public/js/fungis_maplibre_tools.js'
    ]

    for (const src of scriptList) {
      await loadScript(src)
    }

    // 3. 地图初始化配置
    const isHttps = window.location.protocol === 'https:'
    const currentHost = window.location.hostname || 'localhost'
    const NGINX_TILE_HOST = isHttps ? `https://${currentHost}` : `http://${currentHost}:8088`
    const LOCAL_MAX_ZOOM = await getLocalMaxZoom()
    console.log(`[MapLibre] 动态加载本地矢量切片最大层级 LOCAL_MAX_ZOOM: ${LOCAL_MAX_ZOOM}`)

    const OFFICIAL_CHINA_CENTER = [103.54, 36]
    const OFFICIAL_CHINA_ZOOM = 3.6

    // 安全添加/重新注册 smgi 切片协议与 smgi-font 字体协议
    try {
      if (window.maplibregl) {
        try { window.maplibregl.removeProtocol('smgi') } catch (e) { }
        window.maplibregl.addProtocol('smgi', async (params, abortController) => {
          if (params.url.includes('/api_tile/tile/base/')) {
            const match = params.url.match(/\/api_tile\/tile\/base\/(\d+)\/(\d+)\/(\d+)/)
            if (match) {
              const [, zStr, x, y] = match
              const z = parseInt(zStr, 10)
              const maxAllowedZoom = getLocalMaxZoomSync()
              if (z <= maxAllowedZoom) {
                const urlsToTry = [
                  `${NGINX_TILE_HOST}/tiles_base/${z}/${x}/${y}.pbf`,
                  `/tiles_base/${z}/${x}/${y}.pbf`
                ]
                for (const tileUrl of urlsToTry) {
                  try {
                    const localRes = await fetch(tileUrl, { signal: abortController.signal })
                    const ct = localRes.headers.get('content-type') || ''
                    if (localRes.status === 200 && !ct.includes('html')) {
                      const data = await localRes.arrayBuffer()
                      const uint8 = new Uint8Array(data)
                      // 严格校验二进制头，防止 SPA fallback 返回的 index.html (< 字符 wireType 4) 污染 Protobuf 解码
                      if (uint8.length > 0 && uint8[0] !== 60) {
                        return { data }
                      }
                    }
                  } catch (e) { }
                }
              }
            }
          }
          return { data: new Uint8Array(0) }
        })

        try { window.maplibregl.removeProtocol('smgi-font') } catch (e) { }
        window.maplibregl.addProtocol('smgi-font', async (params, abortController) => {
          const pathPart = params.url.replace(/^smgi-font:\/\//, '')
          // 1. 尝试本地 /Public/fonts/ 目录对应路径
          try {
            const res = await fetch(`/Public/fonts/${pathPart}`, { signal: abortController.signal })
            const ct = res.headers.get('content-type') || ''
            if (res.ok && !ct.includes('html')) {
              const buf = await res.arrayBuffer()
              const uint8 = new Uint8Array(buf)
              if (uint8.length > 0 && uint8[0] !== 60) {
                return { data: buf }
              }
            }
          } catch (e) { }

          // 2. 若请求的是 0-255.pbf 基础字形，兜底到方正中等线本地 0-255 字体
          if (pathPart.includes('0-255.pbf')) {
            try {
              const res = await fetch('/Public/fonts/方正中等线_GBK/0-255.pbf', { signal: abortController.signal })
              const ct = res.headers.get('content-type') || ''
              if (res.ok && !ct.includes('html')) {
                const buf = await res.arrayBuffer()
                const uint8 = new Uint8Array(buf)
                if (uint8.length > 0 && uint8[0] !== 60) {
                  return { data: buf }
                }
              }
            } catch (e) { }
          }

          // 3. 未命中的生僻字形区间，安全返回 0 字节的空 PBF buffer，杜绝 HTML 解析报错
          return { data: new Uint8Array(0) }
        })
      }
    } catch (e) {
      console.warn('MapLibre protocol registration warning:', e)
    }

    window.addAllDecodedImagesToMap = addAllDecodedImagesToMap

    await preloadAllIcons()

    // 统一为暗黑主题修正底图背景底色，删除远程 sprite 并本地化 glyphs 字体，避免远程网络阻塞或关闭报错
    if (window.SMGI_STYLES) {
      Object.keys(window.SMGI_STYLES).forEach(key => {
        const themeObj = window.SMGI_STYLES[key]
        if (themeObj && themeObj.style) {
          if (themeObj.style.sources && themeObj.style.sources.base) {
            themeObj.style.sources.base.maxzoom = LOCAL_MAX_ZOOM
          }
          delete themeObj.style.sprite
          themeObj.style.glyphs = 'smgi-font://{fontstack}/{range}.pbf'
          if (Array.isArray(themeObj.style.layers)) {
            themeObj.style.layers.forEach(l => {
              if (l.type === 'background' || l.id === '背景') {
                l.paint = l.paint || {}
                l.paint['background-color'] = '#0b1120'
                l.paint['background-opacity'] = 1
              }
            })
          }
        }
      })
    }

    let currentTheme = 'standard'
    const initialStyle = (window.SMGI_STYLES && window.SMGI_STYLES[currentTheme])
      ? JSON.parse(JSON.stringify(window.SMGI_STYLES[currentTheme].style))
      : { version: 8, sources: {}, layers: [] }

    const map = new window.maplibregl.Map({
      container: mapContainerRef.value || 'map',
      style: initialStyle,
      center: OFFICIAL_CHINA_CENTER,
      zoom: OFFICIAL_CHINA_ZOOM,
      minZoom: 1,
      maxZoom: 18,
      refreshExpiredTiles: false,
      dragRotate: true,
      pitch: 0,
      maxPitch: 85,
      localIdeographFontFamily: 'sans-serif',
      attributionControl: false,
      transformRequest: (url, resourceType) => {
        if (url && (url.includes('smgi.com.cn:8085/font') || resourceType === 'Glyphs')) {
          const match = url.match(/\/font\/([^/]+)\/([^/]+)\.pbf/)
          if (match) {
            return {
              url: `smgi-font://${match[1]}/${match[2]}.pbf`
            }
          }
        }
        return { url }
      }
    })

    mapInstance = map

    map.on('styleimagemissing', (e) => {
      const iconName = e.id
      const img = decodedImagesMap.get(iconName)
      if (img && !map.hasImage(iconName)) {
        try {
          map.addImage(iconName, img, { pixelRatio: 2 })
        } catch (err) { }
      }
    })

    map.addControl(new window.maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new window.maplibregl.FullscreenControl(), 'top-right')

    // 鼠标滚轮中键 3D 控制 (Bearing & Pitch)
    const canvas = map.getCanvas()
    let isMiddleMouseDown = false
    let startX = 0, startY = 0, startBearing = 0, startPitch = 0

    middleMouseDownHandler = (e) => {
      if (e.button === 1) {
        e.preventDefault()
        isMiddleMouseDown = true
        startX = e.clientX
        startY = e.clientY
        startBearing = map.getBearing()
        startPitch = map.getPitch()
        canvas.style.cursor = 'move'
      }
    }

    mouseMoveHandler = (e) => {
      if (!isMiddleMouseDown) return
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY
      const bearing = startBearing + deltaX * 0.4
      const pitch = Math.min(85, Math.max(0, startPitch - deltaY * 0.4))
      map.setBearing(bearing)
      map.setPitch(pitch)
    }

    mouseUpHandler = (e) => {
      if (e.button === 1 && isMiddleMouseDown) {
        isMiddleMouseDown = false
        canvas.style.cursor = ''
      }
    }

    canvas.addEventListener('mousedown', middleMouseDownHandler)
    window.addEventListener('mousemove', mouseMoveHandler)
    window.addEventListener('mouseup', mouseUpHandler)

    // 响应 App.vue 侧边栏与窗口尺寸自适应
    resizeHandler = () => {
      if (map) {
        map.resize()
      }
    }
    window.addEventListener('resize', resizeHandler)

    // 地图初次就绪，装配底图图标并调用公共路径规划业务引擎
    map.once('load', () => {
      addAllDecodedImagesToMap(map)
      // 将 map 所在的 layer 背景设置为同大背景一样的深蓝色 (#0b1120)
      if (map.getLayer('背景')) {
        map.setPaintProperty('背景', 'background-color', '#0b1120')
        map.setPaintProperty('背景', 'background-opacity', 1)
      }
      const styleLayers = (map.getStyle() && map.getStyle().layers) || []
      styleLayers.forEach(lyr => {
        if (lyr.type === 'background') {
          map.setPaintProperty(lyr.id, 'background-color', '#0b1120')
          map.setPaintProperty(lyr.id, 'background-opacity', 1)
        }
      })

      // 实时更新左上角 Zoom Level
      const zoomValEl = document.getElementById('zoomValue')
      const updateZoomDisplay = () => {
        if (zoomValEl) {
          zoomValEl.textContent = map.getZoom().toFixed(1)
        }
      }
      map.on('zoom', updateZoomDisplay)
      updateZoomDisplay()

      const $ = window.jQuery || window.$

      // 1. 独立初始化 WMTS 背景道路切片与图层控制 (线上生产走当前域名 Nginx /geoserver/ 反向代理)
      const baseApiUrl = isHttps ? '' : (currentHost === 'localhost' ? '' : `http://${currentHost}:8080`)
      if (window.WmtsRoadManager) {
        window.WmtsRoadManager.init(map, { geoserverUrl: baseApiUrl, apiBaseUrl: baseApiUrl })
      }

      // 2. 点击路径规划按钮后，初次调用并初始化公共路径规划业务引擎
      let isRouteManagerInited = false
      const $btnToggleRoute = $('#btnToggleRoutePanel')
      const $routePanel = $('#routePanel')

      $btnToggleRoute.off('click').on('click', function (e) {
        if (!isRouteManagerInited) {
          isRouteManagerInited = true
          if (window.PgrbRouteManager) {
            window.PgrbRouteManager.init(map, { geoserverUrl: baseApiUrl, apiBaseUrl: baseApiUrl })
          }
          $routePanel.fadeIn(200)
          $btnToggleRoute.addClass('active')
          e.stopImmediatePropagation()
        }
      })

      // 3. 起终点坐标一键快速对调功能
      $('#btnSwapWaypoints').off('click').on('click', function () {
        const sLng = $('#startLng').val()
        const sLat = $('#startLat').val()
        const eLng = $('#endLng').val()
        const eLat = $('#endLat').val()
        $('#startLng').val(eLng)
        $('#startLat').val(eLat)
        $('#endLng').val(sLng)
        $('#endLat').val(sLat)
        if (window.PgrbRouteManager && window.PgrbRouteManager.isInitialized) {
          window.PgrbRouteManager.updateMarkers()
        }
      })

      // 4. 弹出式经纬度坐标输入模态框控制
      const $coordModal = $('#coordInputModal')
      $('#btnOpenCoordModal').off('click').on('click', function (e) {
        e.stopPropagation()
        $coordModal.fadeIn(150)
      })
      $('#btnCloseCoordModal').off('click').on('click', function (e) {
        e.stopPropagation()
        $coordModal.fadeOut(150)
      })
      $('#btnConfirmCoordModal').off('click').on('click', function (e) {
        e.stopPropagation()
        if (window.PgrbRouteManager && window.PgrbRouteManager.isInitialized) {
          window.PgrbRouteManager.updateMarkers()
        }
        $coordModal.fadeOut(150)
      })
      $('#btnClearCoordInputs').off('click').on('click', function (e) {
        e.stopPropagation()
        $('#startLng, #startLat, #endLng, #endLat').val('')
        if (window.PgrbRouteManager && window.PgrbRouteManager.isInitialized) {
          window.PgrbRouteManager.updateMarkers()
        }
      })

      // 5. 点击起终点整行区域快捷进入选点模式
      $('#groupSingleStart').off('click').on('click', function (e) {
        if (!$(e.target).closest('#btnPickStart').length) {
          if (window.PgrbRouteManager && window.PgrbRouteManager.isInitialized) {
            window.PgrbRouteManager.togglePickMode('start')
          } else {
            $('#btnPickStart').trigger('click')
          }
        }
      })
      $('#groupSingleEnd').off('click').on('click', function (e) {
        if (!$(e.target).closest('#btnPickEnd').length) {
          if (window.PgrbRouteManager && window.PgrbRouteManager.isInitialized) {
            window.PgrbRouteManager.togglePickMode('end')
          } else {
            $('#btnPickEnd').trigger('click')
          }
        }
      })

      // 6. 显示规划路径模块：点击“开始规划路径”后才动态出现
      $('#btnPlanRoute').off('click').on('click', function () {
        const sLng = $('#startLng').val()
        const eLng = $('#endLng').val()
        if (sLng && eLng) {
          $('#routeResultSection').slideDown(200)
        }
      })
      $('#btnResetRoute').off('click').on('click', function () {
        $('#routeResultSection').slideUp(200)
        $('#textStartCoord').text('在地图上点击选起点')
        $('#textEndCoord').text('在地图上点击选终点')
        $('#groupSingleStart, #groupSingleEnd').removeClass('has-coord')
      })

      // 7. 初始化从 fungis 移植过来的 8 项核心功能套件
      if (window.FungisMapLibreTools) {
        window.FungisMapLibreTools.init(map)
      }
    })
  } catch (error) {
    console.error('MapLibre_GL 初始化失败:', error)
  }
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (mouseMoveHandler) {
    window.removeEventListener('mousemove', mouseMoveHandler)
    mouseMoveHandler = null
  }
  if (mouseUpHandler) {
    window.removeEventListener('mouseup', mouseUpHandler)
    mouseUpHandler = null
  }
  if (mapInstance) {
    try {
      const canvas = mapInstance.getCanvas()
      if (canvas && middleMouseDownHandler) {
        canvas.removeEventListener('mousedown', middleMouseDownHandler)
      }
      mapInstance.remove()
    } catch (e) {
      console.warn('MapLibre 实例清理异常:', e)
    }
    mapInstance = null
  }
})
</script>

<style scoped>
.maplibre-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #0b1120;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
}

#map {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #0b1120;
}
</style>
