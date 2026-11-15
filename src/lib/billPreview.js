export async function billPreviewImage(blob) {
  const pdf = await blob.text()
  const [, width, height] = pdf.match(/\/MediaBox \[0 0 (\d+) (\d+)\]/)
  const canvas = document.createElement('canvas')
  canvas.width = Number(width) * 2; canvas.height = Number(height) * 2
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.scale(2, 2)
  for (const command of pdf.split('stream\n')[1].split('\nendstream')[0].split('\n')) {
    let m
    if ((m = command.match(/^([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)$/))) {
      ctx[m[4] === 'rg' ? 'fillStyle' : 'strokeStyle'] = `rgb(${m.slice(1,4).map(v=>Math.round(Number(v)*255)).join(',')})`
    } else if ((m = command.match(/^BT \/(F1|F2) ([\d.]+) Tf ([\d.-]+) ([\d.-]+) Td \((.*)\) Tj ET$/))) {
      ctx.font = `${m[1]==='F2'?'bold ':''}${m[2]}px Arial`
      ctx.fillText(m[5].replace(/\\([\\()])/g,'$1'),Number(m[3]),Number(height)-Number(m[4]))
    } else if ((m = command.match(/^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re f$/))) {
      ctx.fillRect(Number(m[1]),Number(height)-Number(m[2])-Number(m[4]),Number(m[3]),Number(m[4]))
    } else if ((m = command.match(/^([\d.]+) w ([\d.-]+) ([\d.-]+) m ([\d.-]+) ([\d.-]+) l S$/))) {
      ctx.lineWidth=Number(m[1]);ctx.beginPath();ctx.moveTo(Number(m[2]),Number(height)-Number(m[3]));ctx.lineTo(Number(m[4]),Number(height)-Number(m[5]));ctx.stroke()
    }
  }
  // Compress only blank row runs in the marketing preview; retain every printed row.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const rows = []
  let blankStart = 0
  for (let y = 0; y <= canvas.height; y++) {
    let hasInk = false
    if (y < canvas.height) {
      for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4
        if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) { hasInk = true; break }
      }
    }
    if (hasInk || y === canvas.height) {
      const gap = y - blankStart
      for (let i = 0; i < Math.min(gap, 28); i++) rows.push(blankStart + i)
      if (hasInk) rows.push(y)
      blankStart = y + 1
    }
  }
  const compact = document.createElement('canvas')
  compact.width = canvas.width; compact.height = rows.length
  const compactCtx = compact.getContext('2d')
  rows.forEach((sourceY, targetY) => compactCtx.drawImage(canvas, 0, sourceY, canvas.width, 1, 0, targetY, canvas.width, 1))
  return compact.toDataURL('image/png')
}
