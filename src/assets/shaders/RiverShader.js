export const riverVS = `
    uniform sampler2D heightMap;
    uniform sampler2D riverHeightMap;
    uniform sampler2D waterNormalMap;
    uniform float maxRiverWidth;
    uniform float u_time;
    uniform vec2 texelSize;
    
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
        vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
        vUv = flippedUV;

        float terrainHeight = texture2D(heightMap, flippedUV).r;
        
        vec4 riverData = texture2D(riverHeightMap, flippedUV);
        float riverWaterHeight = riverData.r;
        float capDist =  riverData.a;
        float boundaryMask = 1.0 - smoothstep(0.0, 1.0, capDist);

        float distanceToCenter = abs(riverData.g);
        float distRatio = distanceToCenter / maxRiverWidth;
        float minDepthThreshold = mix(0.0005, 0.05, distRatio * distRatio);
        float waterDepth = riverWaterHeight - terrainHeight;
        float isDeepEnough = step(minDepthThreshold, waterDepth);
        
        float isRiverArea = step(0.001, riverWaterHeight) * step(distanceToCenter, maxRiverWidth)*boundaryMask;

        float waterMask = isRiverArea * isDeepEnough;

        vec3 pos = position;
        pos.z = terrainHeight;

        if (waterMask > 0.0) {
            pos.z = riverWaterHeight;
        }

        vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

export const riverFS = `
    uniform vec3 terrainColor;
    uniform float u_time;
    uniform float maxRiverWidth;
    uniform vec2 texelSize;
    uniform sampler2D waterNormalMap;   // 水面法线贴图
    uniform sampler2D foamMap;   // 浪花贴图
    uniform sampler2D riverHeightMap;
    uniform sampler2D heightMap;
    
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
        float terrainHeight = texture2D(heightMap, vUv).r;
        vec3 terrainFinalColor = terrainColor * (0.5 + terrainHeight * 0.5);

        vec4 riverData =  texture2D(riverHeightMap, vUv);
        float riverWaterHeight = riverData.r;
        float capDist = riverData.a;
        float boundaryMask = 1.0 - smoothstep(0.0, 1.0, capDist);

        float distanceToCenter = abs(riverData.g);
        float distRatio = distanceToCenter / maxRiverWidth;
        float minDepthThreshold = mix(0.0005, 0.5, distRatio*distRatio );
        float waterDepth = riverWaterHeight - terrainHeight;
        float isDeepEnough = step(minDepthThreshold, waterDepth);

        float isRiverArea = step(0.001, riverWaterHeight) * step(distanceToCenter, maxRiverWidth) * boundaryMask;
        
        float waterMask = isRiverArea * isDeepEnough ;

        vec3 finalColor = terrainFinalColor;
        float finalOpacity = 1.0;
        
        if (waterMask > 0.0) {
            float posU = riverData.b * texelSize.x * 10.0;
            float posV = riverData.g * texelSize.x * 5.0; 
            vec2 riverUV = vec2(posU, posV);

            //计算视角法线
            vec3 camPos = cameraPosition;
            vec3 E = normalize(camPos - vWorldPosition);

            //太阳法线
            vec3 sunDir = normalize(vec3(0.8, 0.4, 0.6));

            //--------------计算水面本体颜色-----------------
            vec2 flowUV = vec2(riverUV.x, riverUV.y);
            vec2 nmUV1 = flowUV * 0.8 + vec2(u_time * 0.05, 0.0);
            vec2 nmUV2 = flowUV * 2.2 + vec2(u_time * 0.03, u_time * 0.045);
            vec3 n1 = texture2D(waterNormalMap, nmUV1).rgb * 2.0 - 1.0;
            vec3 n2 = texture2D(waterNormalMap, nmUV2).rgb * 2.0 - 1.0;
            vec3 detailNormal = normalize(n1 * 0.8 + n2 * 0.2);

            vec3 camPosA = vec3(0.0,80.0, 80.0);
            vec3 E1 = normalize(camPosA - vWorldPosition); 
            float NdotE_fixed = max(dot(detailNormal, E1), 0.0);
            vec3 deepBlue = vec3(0.0, 0.05, 0.5);     
            vec3 shallowGreen = vec3(0.0, 0.2, 0.3);
            vec3 waterColor = mix(shallowGreen, deepBlue, NdotE_fixed);
            
            // ----------------次表面散射----------------
            vec2 sssUV = vec2(riverUV.x*0.5 - u_time*1.0,-riverUV.y*0.5);
            vec2 sssUV1 = sssUV*0.8 + vec2(u_time*0.05,0.0);
            vec2 sssUV2 = sssUV*2.2 + vec2(u_time*0.03,u_time*0.045);
            vec3 s1 = texture2D(waterNormalMap, sssUV1).rgb * 2.0 - 1.0;
            vec3 s2 = texture2D(waterNormalMap, sssUV2).rgb * 2.0 - 1.0;
            vec3 sD = normalize(s1 * 0.9 + s2 * 0.1);

            float sss = pow(max(dot(normalize(sunDir + sD * 0.3), E1), 0.0), 5.0);
            vec3 sssColor = vec3(0.1, 0.6, 0.4) * sss * 2.0; 
            float perturbation1 = 1.0 - s1.z;
            float perturbation2 = 1.0 - s2.z;
            float waveH = perturbation1 * 0.7 + perturbation2 * 0.3;
            float depthFactor = smoothstep(0.0, 0.2, waveH);
            waterColor = mix(waterColor, waterColor + sssColor, depthFactor);
           
            // ----------------水面泡沫----------------
            vec2 foamUV = vec2(riverUV.x*20.0 - u_time*20.0,-riverUV.y*20.0);
            vec2 foamUV1 = foamUV*0.5 + vec2(u_time*0.5,0.0);
            vec4 foamSample = texture2D(foamMap, foamUV1);
            vec3 foamNormal = normalize(foamSample.rgb * 2.0 - 1.0);

            float foamPerturb = foamNormal.z;  
            float foamFactor = smoothstep(0.15, 0.4, foamPerturb);
            float foamNoise = foamSample.b;
            foamNoise = smoothstep(0.78, 0.82, foamNoise);  
            vec3 foamColor = vec3(1.0, 1.0, 1.0);
            waterColor = mix(waterColor, foamColor, foamFactor * foamNoise * 0.15); 
            
            // ---------------- [ 太阳镜面高光 (Specular) 颜色 ] ----------------
            float baseReflectivity = 0.03;
            float fresnel = baseReflectivity + (1.0 - baseReflectivity) * pow(1.0 - max(dot(detailNormal, E), 0.0), 5.0);
            
            vec3 H = normalize(sunDir + E);
            float NdotH = max(dot(detailNormal, H), 0.0);
            float specBase     = pow(NdotH, 32.0);
            float specSparkles = pow(NdotH, 256.0);
            vec3 sunColor = vec3(1.0,1.0,1.0);
            vec3 specular = sunColor * specBase * 0.8 + vec3(1.0) * specSparkles * 5.0;
            waterColor += specular * fresnel * 2.0;

            finalColor = mix(terrainFinalColor, waterColor, waterMask);
            finalOpacity = mix(1.0, 0.75, waterMask);
            float luminance = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
            float mappedLum = luminance / (luminance + 1.0);
            finalColor *= mappedLum / max(luminance, 0.001);
            finalColor = pow(finalColor, vec3(1.0 / 2.2)); 
        }else {
            discard;
        }

        gl_FragColor = vec4(finalColor, finalOpacity);
    }
`;
