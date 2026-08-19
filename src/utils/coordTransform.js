/**
 * 坐标系转换工具 (WGS84 / GCJ-02 / BD-09)
 */

const PI = 3.1415926535897932384626;
const a = 6378245.0;
const ee = 0.00669342162296594323;

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

export function outOfChina(lng, lat) {
  return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
}

/**
 * WGS84 转换为 GCJ-02 (高德/腾讯/Apple地图)
 */
export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) {
    return [lng, lat];
  }
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  let radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  let sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
  let mgLat = lat + dLat;
  let mgLng = lng + dLng;
  return [mgLng, mgLat];
}

/**
 * GCJ-02 转换为 BD-09 (百度地图)
 */
export function gcj02ToBd09(lng, lat) {
  let x_pi = PI * 3000.0 / 180.0;
  let z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * x_pi);
  let theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * x_pi);
  let bd_lng = z * Math.cos(theta) + 0.0065;
  let bd_lat = z * Math.sin(theta) + 0.006;
  return [bd_lng, bd_lat];
}

/**
 * WGS84 转换为 BD-09 (百度地图)
 */
export function wgs84ToBd09(lng, lat) {
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
  return gcj02ToBd09(gcjLng, gcjLat);
}

/**
 * 生成各地图导航 URL 链接
 * @param {number} lng 经度 (WGS84 或实际经度)
 * @param {number} lat 纬度 (WGS84 或实际纬度)
 * @param {string} title 终点名称
 */
export function getMapNavUrls(lng, lat, title = '目标位置') {
  const numLng = Number(lng);
  const numLat = Number(lat);

  // GCJ-02 (高德、腾讯、Apple 地图)
  const [gcjLng, gcjLat] = wgs84ToGcj02(numLng, numLat);
  // BD-09 (百度地图)
  const [bdLng, bdLat] = wgs84ToBd09(numLng, numLat);

  const encTitle = encodeURIComponent(title);

  return {
    amap: `https://uri.amap.com/navigation?to=${gcjLng.toFixed(6)},${gcjLat.toFixed(6)},${encTitle}&mode=car&policy=1&src=fungis&callnative=1`,
    baidu: `https://api.map.baidu.com/direction?destination=name:${encTitle}|latlng:${bdLat.toFixed(6)},${bdLng.toFixed(6)}&mode=driving&output=html&src=fungis`,
    tencent: `https://apis.map.qq.com/uri/v1/routeplan?type=drive&to=${encTitle}&tocoord=${gcjLat.toFixed(6)},${gcjLng.toFixed(6)}&referer=fungis`,
    apple: `https://maps.apple.com/?daddr=${gcjLat.toFixed(6)},${gcjLng.toFixed(6)}&q=${encTitle}`
  };
}
