export const vertexShaderSource = `
    attribute vec4 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = a_position;
        v_texCoord = a_texCoord;
    }
`;

export const fragmentShaderSource = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_texture;

    // Define a simple color palette
    const vec3 palette0 = vec3(0.90, 0.88, 0.78); // Parchment
    const vec3 palette1 = vec3(0.48, 0.27, 0.06); // Dark Brown
    const vec3 palette2 = vec3(0.29, 0.11, 0.13); // Deep Red
    const vec3 palette3 = vec3(0.11, 0.29, 0.13); // Green
    const vec3 palette4 = vec3(0.50, 0.50, 0.0); // Yellow Ochre
    const vec3 palette5 = vec3(0.0, 0.0, 0.0); // Black

    // Function to convert to a reduced color pallette
    vec3 quantizeColor(vec3 color) {
        float minDist = 1000.0;
        vec3 closestColor;

        float dist0 = distance(color, palette0);
        if (dist0 < minDist) {
            minDist = dist0;
            closestColor = palette0;
        }
        float dist1 = distance(color, palette1);
        if (dist1 < minDist) {
          minDist = dist1;
          closestColor = palette1;
        }
        float dist2 = distance(color, palette2);
        if (dist2 < minDist) {
          minDist = dist2;
          closestColor = palette2;
        }
        float dist3 = distance(color, palette3);
        if (dist3 < minDist) {
            minDist = dist3;
            closestColor = palette3;
        }
        float dist4 = distance(color, palette4);
        if (dist4 < minDist) {
            minDist = dist4;
            closestColor = palette4;
        }
        float dist5 = distance(color, palette5);
        if (dist5 < minDist) {
            minDist = dist5;
            closestColor = palette5;
        }

        return closestColor;
    }

    // Function to calculate edges
    float edgeDetection(vec2 uv) {
        float edge = 0.0;
        float offset = 0.002;

        vec4 c = texture2D(u_texture, uv);
        vec4 c1 = texture2D(u_texture, uv + vec2(offset, 0.0));
        vec4 c2 = texture2D(u_texture, uv + vec2(-offset, 0.0));
        vec4 c3 = texture2D(u_texture, uv + vec2(0.0, offset));
        vec4 c4 = texture2D(u_texture, uv + vec2(0.0, -offset));

        float diff = (
            distance(c.rgb, c1.rgb) +
            distance(c.rgb, c2.rgb) +
            distance(c.rgb, c3.rgb) +
            distance(c.rgb, c4.rgb)
        );

        edge = step(0.1, diff);

        return edge;
    }

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    void main() {
        vec4 color = texture2D(u_texture, v_texCoord);

        //Apply Color Quantization
        vec3 quantized = quantizeColor(color.rgb);

        // Detect Edges
        float edge = edgeDetection(v_texCoord);
        vec3 edgeColor = palette5; // black edge color

        // add in a parchment texture
        float noise = random(v_texCoord * 500.0) * 0.01;
        vec3 parchment = palette0 + vec3(noise);

        // Blend the stylized color, edge, and texture
        vec3 finalColor = mix(quantized, edgeColor, edge);
        gl_FragColor = vec4(mix(parchment, finalColor, 1.0 - edge), 1.0);

    }
`;
