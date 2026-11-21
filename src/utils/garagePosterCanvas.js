const WIDTH = 1122;
const HEIGHT = 794;

function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > width) {
        const split = line.lastIndexOf(" ");
        if (split > 0) {
          lines.push(line.slice(0, split));
          line = line.slice(split + 1) + character;
        } else {
          lines.push(line);
          line = character;
        }
      } else line += character;
    }
    lines.push(line);
  }
  return lines;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar una imagen del cartel."));
    image.src = src;
  });
}

// Preview and both exports share these coordinates and native font baselines.
// HTML rasterization changes font positions for mixed font sizes/weights.
export async function renderGaragePoster({ name, showCommunityName, dateLabel, time, boxes, guides = false }) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";

  function centered(text, size, weight, baseline, maxWidth = 1030) {
    ctx.font = `${weight} ${size}px Arial`;
    const fitted = Math.min(size, size * maxWidth / Math.max(1, ctx.measureText(text).width));
    ctx.font = `${weight} ${fitted}px Arial`;
    ctx.fillStyle = "#070707";
    ctx.textAlign = "center";
    ctx.fillText(text, WIDTH / 2, baseline);
  }

  centered("Limpieza de Garaje", 112, 400, 120);
  if (showCommunityName) centered(name, 26, 700, 169);
  const offset = showCommunityName ? 24 : 0;
  centered("La limpieza del garaje se realizará el", 45, 400, 207 + offset);

  const runs = [
    { text: dateLabel, size: 37, weight: 700, color: "#e00" },
    { text: " a partir de las ", size: 37, weight: 700, color: "#070707" },
    { text: `${time || "--:--"}.`, size: 43, weight: 800, color: "#070707" },
  ];
  const measure = (run, scale = 1) => {
    ctx.font = `${run.weight} ${run.size * scale}px Arial`;
    return ctx.measureText(run.text).width;
  };
  // Enlarge short dates and fit long ones, including September, inside the page.
  const naturalWidth = runs.reduce((sum, run) => sum + measure(run), 0);
  const scale = Math.min(1.4, 1030 / naturalWidth);
  let x = (WIDTH - runs.reduce((sum, run) => sum + measure(run, scale), 0)) / 2;
  ctx.textAlign = "left";
  for (const run of runs) {
    const width = measure(run, scale);
    ctx.fillStyle = run.color;
    ctx.fillText(run.text, x, 277 + offset);
    x += width;
  }

  centered("Se ruega que se retiren los coches de las plazas", 43, 400, 366 + offset);
  centered("para limpiarlas. Gracias", 43, 400, 430 + offset);
  centered("(La empresa no se hace responsable de desperfectos en artículos que no se retiren del suelo).", 23, 400, 594);

  for (let index = 0; index < 2; index++) {
    const box = boxes[index] || { type: "empty" };
    const left = 46 + index * 519;
    const top = 620;
    const width = 511;
    const height = 150;
    if (guides) {
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(left, top, width, height);
      ctx.setLineDash([]);
    }
    if (box.type === "image" && box.image) {
      const image = await loadImage(box.image);
      const ratio = Math.min((width - 24) / image.width, (height - 24) / image.height);
      ctx.drawImage(image, left + (width - image.width * ratio) / 2, top + (height - image.height * ratio) / 2, image.width * ratio, image.height * ratio);
    }
    if (box.type === "text" && box.text) {
      let size = 28;
      let lines;
      do {
        ctx.font = `400 ${size}px Arial`;
        lines = wrapText(ctx, box.text, width - 24);
        if (lines.length * size * 1.2 <= height - 24) break;
        size--;
      } while (size > 8);
      ctx.fillStyle = "#070707";
      ctx.textAlign = "center";
      const lineHeight = size * 1.2;
      const firstBaseline = top + (height - lines.length * lineHeight) / 2 + size;
      lines.forEach((line, i) => ctx.fillText(line, left + width / 2, firstBaseline + i * lineHeight));
    }
  }
  return canvas;
}
