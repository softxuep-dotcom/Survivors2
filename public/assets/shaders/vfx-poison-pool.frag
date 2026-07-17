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
uniform sampler2D uNoise;

varying vec2 outTexCoord;

float softNoise (vec2 uv)
{
    vec2 texel = vec2(1.0 / 64.0);
    return (
        texture2D(uNoise, uv).r
        + texture2D(uNoise, uv + vec2(texel.x, 0.0)).r
        + texture2D(uNoise, uv + vec2(0.0, texel.y)).r
        + texture2D(uNoise, uv + texel).r
    ) * 0.25;
}

void main ()
{
    vec2 uv = outTexCoord;
    vec2 p = (uv - 0.5) * 2.0;
    p.y *= 1.08;

    float progress = clamp(uProgress, 0.0, 1.0);
    float intro = smoothstep(0.0, 0.105, progress);
    float easedIntro = 1.0 - pow(1.0 - intro, 3.0);
    float dissolve = smoothstep(0.58, 1.0, progress);

    vec2 drift = uDirection * uTime * 0.026;
    float coarse = softNoise(fract(uv * 1.75 + drift));
    float detail = softNoise(fract(uv * 3.4 - drift * 1.7 + vec2(0.31, 0.17)));
    float dissolveNoise = softNoise(fract(uv * 2.65 + vec2(uTime * 0.012, -uTime * 0.009)));

    float angle = atan(p.y, p.x);
    float edgeNoise = (coarse - 0.5) * 0.075
        + sin(angle * 7.0 + uTime * 0.42) * 0.021
        + sin(angle * 11.0 - uTime * 0.31) * 0.011;
    float radius = mix(0.07, 0.88, easedIntro) + edgeNoise;
    float signedEdge = radius - length(p);
    float body = smoothstep(-0.035, 0.025, signedEdge);

    float survive = smoothstep(dissolve - 0.22, dissolve + 0.25, dissolveNoise);
    float movingCells = smoothstep(0.48, 0.75, detail + 0.13 * sin((uv.x + uv.y) * 16.0 + uTime * 0.9));
    float inner = body * survive;
    float edge = (1.0 - smoothstep(0.0, 0.07, abs(signedEdge))) * survive;

    vec3 liquid = mix(uColorA.rgb, uColorB.rgb, 0.16 + coarse * 0.38 + movingCells * 0.23);
    liquid += uColorB.rgb * edge * 0.24;
    liquid += vec3(0.12, 0.17, 0.05) * movingCells * inner * 0.18;

    float alpha = inner * (0.53 + coarse * 0.12) + edge * 0.16;
    alpha *= uOpacity * uIntensity;
    alpha *= smoothstep(0.0, 0.025, intro);
    vec4 color = vec4(liquid, clamp(alpha, 0.0, 0.94));
    color.rgb *= color.a;
    gl_FragColor = color;
}
