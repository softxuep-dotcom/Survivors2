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

float noise2 (vec2 uv) { return texture2D(uNoise, fract(uv)).r; }

void main ()
{
    vec2 uv = outTexCoord;
    vec2 p = (uv - 0.5) * 2.0;
    p.y *= 1.04;
    float r = length(p);
    float angle = atan(p.y, p.x);
    float progress = clamp(uProgress, 0.0, 1.0);
    float fade = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.7, 1.0, progress));
    float n = noise2(uv * 4.0 + vec2(uTime * 0.025, -uTime * 0.018));
    vec3 rgb = vec3(0.0);
    float alpha = 0.0;

    if (uVariant < 0.5)
    {
        // 圣辉光环：双层圣环、旋转十二向光节和轻微呼吸。
        float breathe = sin(uTime * 4.2) * 0.018;
        float outer = 1.0 - smoothstep(0.0, 0.035, abs(r - (0.86 + breathe)));
        float inner = 1.0 - smoothstep(0.0, 0.024, abs(r - (0.69 - breathe * 0.5)));
        float spoke = pow(max(0.0, cos(angle * 12.0 - uTime * 1.45)), 18.0);
        float seals = spoke * (1.0 - smoothstep(0.045, 0.12, abs(r - 0.78)));
        float soft = (1.0 - smoothstep(0.42, 0.9, r)) * (0.1 + n * 0.08);
        rgb = mix(uColorA.rgb, uColorB.rgb, 0.38 + outer * 0.42 + seals * 0.3);
        alpha = (outer * 0.58 + inner * 0.27 + seals * 0.72 + soft) * uOpacity * uIntensity * fade;
    }
    else
    {
        // 刃风暴：多段高速环形切线，避免整圆成为静态 UI 圈。
        float ring = 1.0 - smoothstep(0.0, 0.055, abs(r - 0.79));
        float sweep = angle * 3.0 - uTime * 8.2;
        float arcs = smoothstep(0.12, 0.92, sin(sweep) * 0.5 + 0.5);
        float razor = pow(arcs, 5.0) * ring;
        float second = pow(max(0.0, sin(angle * 4.0 + uTime * 6.4)), 7.0)
            * (1.0 - smoothstep(0.0, 0.04, abs(r - 0.66)));
        float glint = pow(max(0.0, cos(angle * 8.0 - uTime * 10.0)), 22.0) * ring;
        rgb = mix(uColorA.rgb, uColorB.rgb, 0.25 + razor * 0.5 + glint * 0.35);
        alpha = (razor * 0.82 + second * 0.34 + glint * 0.9) * uOpacity * uIntensity * fade;
    }

    vec4 color = vec4(rgb, clamp(alpha, 0.0, 0.94));
    color.rgb *= color.a;
    gl_FragColor = color;
}
