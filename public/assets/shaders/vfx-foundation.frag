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

void main ()
{
    vec2 uv = outTexCoord;
    vec2 aspect = vec2(max(uResolution.x / max(uResolution.y, 1.0), 1.0), 1.0);
    vec2 centered = (uv - 0.5) * aspect;
    vec2 flowUv = fract(uv * 2.0 + uDirection * uTime * 0.035);
    float noiseValue = texture2D(uNoise, flowUv).r;
    float radial = smoothstep(0.58, 0.08, length(centered));
    float life = sin(clamp(uProgress, 0.0, 1.0) * 3.14159265);
    float energy = radial * mix(0.72, 1.0, noiseValue) * mix(1.0, life, 0.18) * uIntensity;
    vec4 color = mix(uColorA, uColorB, noiseValue);
    color.a *= energy * uOpacity;
    color.rgb *= color.a;
    gl_FragColor = color;
}
