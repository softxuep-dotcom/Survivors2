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

void main () {
  vec2 uv = outTexCoord;
  float axis = uDirection.x >= 0.0 ? uv.x : 1.0 - uv.x;
  float crossAxis = abs(uv.y - 0.5) * 2.0;
  float softBand = pow(max(0.0, 1.0 - crossAxis), 2.2);
  float hotCore = pow(max(0.0, 1.0 - crossAxis), 8.0);

  float noise = texture2D(uNoise, vec2(fract(axis * 2.8 - uTime * 0.95), uv.y)).r;
  float wave = 0.5 + 0.5 * sin(axis * 82.0 - uTime * 26.0 + noise * 5.5);
  float packet = pow(max(0.0, sin(axis * 36.0 - uTime * 19.0 + noise * 3.0)), 7.0);
  float travelingEnergy = 0.34 + wave * 0.30 + packet * 1.15;

  float endMask = smoothstep(0.0, 0.035, axis) * smoothstep(0.0, 0.045, 1.0 - axis);
  float lifeFade = smoothstep(0.0, 0.06, uProgress) * (1.0 - smoothstep(0.56, 1.0, uProgress));
  vec3 color = mix(uColorA.rgb, uColorB.rgb, clamp(hotCore + packet * 0.55, 0.0, 1.0));
  float alpha = (softBand * travelingEnergy + hotCore * 0.65) * endMask * lifeFade
    * uOpacity * uIntensity;

  gl_FragColor = vec4(color * alpha, alpha);
}
