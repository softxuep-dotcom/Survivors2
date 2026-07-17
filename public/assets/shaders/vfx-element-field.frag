#version 100
#pragma phaserTemplate(shaderName)

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float uTime;
uniform float uProgress;
uniform float uIntensity;
uniform vec2 uResolution;
uniform vec2 uDirection;
uniform vec4 uColorA;
uniform vec4 uColorB;
uniform float uOpacity;
uniform float uVariant;
uniform sampler2D uNoise;

varying vec2 outTexCoord;

float noise2 (vec2 uv)
{
    return texture2D(uNoise, fract(uv)).r;
}

float circleMask (vec2 p, float radius, float feather)
{
    return 1.0 - smoothstep(radius - feather, radius, length(p));
}

void main ()
{
    vec2 uv = outTexCoord;
    vec2 p = (uv - 0.5) * 2.0;
    float progress = clamp(uProgress, 0.0, 1.0);
    float lifeFade = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.76, 1.0, progress));
    vec3 rgb = vec3(0.0);
    float alpha = 0.0;

    if (uVariant < 0.5)
    {
        // 烈焰路径仅叠加轻热浪；现有 Sprite 负责火舌、炭火与地面轮廓。
        p.y *= 1.12;
        float mask = circleMask(p, 0.9, 0.18);
        float drift = uTime * 1.35;
        float n = noise2(uv * vec2(2.1, 3.8) + vec2(0.0, -uTime * 0.08));
        float waveA = sin(p.x * 13.0 + p.y * 4.0 - drift + n * 3.0);
        float waveB = sin(p.x * 8.0 - p.y * 7.0 + drift * 0.72);
        float ribbons = smoothstep(1.1, 1.72, waveA + waveB);
        float shimmer = 0.35 + 0.65 * noise2(uv * 4.2 + vec2(uTime * 0.025, -uTime * 0.11));
        rgb = mix(uColorA.rgb, uColorB.rgb, shimmer);
        alpha = mask * ribbons * shimmer * 0.18 * uOpacity * uIntensity;
        alpha *= smoothstep(0.0, 0.05, progress) * (1.0 - smoothstep(0.91, 1.0, progress));
    }
    else if (uVariant < 1.5)
    {
        // 暴风雪：只保留流动明暗的破碎外缘，中心完全通透，避免遮住敌人与地面预警。
        p.y *= 1.05;
        float r = length(p);
        vec2 dir = normalize(uDirection + vec2(0.0001));
        float angle = atan(p.y, p.x);
        float flowAngle = atan(dir.y, dir.x);
        float frost = noise2(uv * 3.6 + dir * uTime * 0.045);
        frost *= noise2(uv * 7.2 + vec2(-dir.y, dir.x) * uTime * 0.035 + 0.21);
        float arcPulse = 0.5 + 0.5 * sin((angle - flowAngle) * 3.0 - uTime * 1.8);
        float rim = 1.0 - smoothstep(0.0, 0.038, abs(r - 0.87));
        float brokenRim = rim * (0.22 + 0.58 * smoothstep(0.28, 0.72, frost + arcPulse * 0.26));
        rgb = mix(uColorA.rgb, uColorB.rgb, 0.38 + frost * 0.4 + arcPulse * 0.18);
        alpha = brokenRim * 0.46 * uOpacity * uIntensity * lifeFade;
    }
    else if (uVariant < 2.5)
    {
        // 寒霜脉冲：径向结冰环向外推进，角向裂纹在环后快速显现。
        float r = length(p);
        float radius = mix(0.08, 1.02, smoothstep(0.0, 0.86, progress));
        float ring = 1.0 - smoothstep(0.0, 0.075, abs(r - radius));
        float angle = atan(p.y, p.x);
        float crackNoise = noise2(vec2(angle / 6.28318 + 0.5, r * 2.8 + uTime * 0.015));
        float spokes = pow(abs(sin(angle * 7.0 + crackNoise * 3.2)), 20.0);
        float cracks = spokes * smoothstep(0.16, radius, r) * (1.0 - smoothstep(radius, radius + 0.09, r));
        float frozen = (1.0 - smoothstep(radius - 0.18, radius, r)) * circleMask(p, 0.99, 0.08);
        float grains = noise2(uv * 7.5 + vec2(progress * 0.12, 0.0));
        rgb = mix(uColorA.rgb, uColorB.rgb, 0.3 + grains * 0.45 + ring * 0.35);
        alpha = (ring * 0.76 + cracks * 0.5 + frozen * grains * 0.15) * uOpacity * uIntensity * lifeFade;
    }
    else
    {
        // 火球爆炸的局部热折射读感：噪声扰动的双冲击环，不采样全屏画面。
        float r = length(p);
        float n = noise2(uv * 4.4 + vec2(uTime * 0.08, -uTime * 0.06));
        float radius = mix(0.08, 1.02, smoothstep(0.0, 0.84, progress));
        float warped = r + (n - 0.5) * 0.075;
        float outer = 1.0 - smoothstep(0.0, 0.055, abs(warped - radius));
        float inner = 1.0 - smoothstep(0.0, 0.035, abs(warped - radius * 0.73));
        float shimmer = 0.5 + 0.5 * sin((r - progress) * 38.0 - uTime * 4.0 + n * 5.0);
        rgb = mix(uColorA.rgb, uColorB.rgb, shimmer);
        alpha = (outer * 0.62 + inner * 0.23) * uOpacity * uIntensity * lifeFade;
    }

    vec4 color = vec4(rgb, clamp(alpha, 0.0, 0.92));
    color.rgb *= color.a;
    gl_FragColor = color;
}
