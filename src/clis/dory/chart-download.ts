import * as fs from 'node:fs';
import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const chartDownloadCommand = cli({
  site: 'dory',
  name: 'chart-download',
  description: 'Download the currently visible chart as SVG or PNG',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'output', required: false, help: 'Output file path (default: /tmp/dory-chart.svg). Use .png for PNG.' },
    { name: 'image-format', required: false, help: 'Image format: svg or png (default: svg)', choices: ['svg', 'png'], default: 'svg' },
  ],
  columns: ['Status', 'File', 'Format', 'Width', 'Height'],
  func: async (page: IPage, kwargs: any) => {
    const format = (kwargs['image-format'] as string) || 'svg';
    const ext = format === 'png' ? 'png' : 'svg';
    const outputPath = (kwargs.output as string) || `/tmp/dory-chart.${ext}`;

    const chartData = await page.evaluate(`
      (async function(format) {
        // Find the Recharts SVG — it lives inside .recharts-wrapper
        const svgEl = document.querySelector('.recharts-wrapper svg')
          ?? document.querySelector('[data-testid="result-table"] svg')
          ?? document.querySelector('svg.recharts-surface');

        if (!svgEl) return { error: 'No chart SVG found on page. Switch to Charts view first.' };

        const width = svgEl.clientWidth || svgEl.getAttribute('width') || 800;
        const height = svgEl.clientHeight || svgEl.getAttribute('height') || 400;

        // Serialize SVG with proper namespaces
        const cloned = svgEl.cloneNode(true);
        cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(cloned);

        if (format === 'svg') {
          return { svgString: svgString, width: width, height: height };
        }

        // PNG: render SVG onto a canvas and export as base64
        return new Promise(function(resolve) {
          const canvas = document.createElement('canvas');
          canvas.width = Number(width);
          canvas.height = Number(height);
          const ctx = canvas.getContext('2d');
          const img = new Image();
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          img.onload = function() {
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ pngBase64: dataUrl.split(',')[1], width: Number(width), height: Number(height) });
          };
          img.onerror = function() {
            URL.revokeObjectURL(url);
            resolve({ error: 'Failed to render chart to canvas', svgString: svgString, width: Number(width), height: Number(height) });
          };
          img.src = url;
        });
      })(${JSON.stringify(format)})
    `);

    if (chartData.error && !chartData.svgString) {
      return [{ Status: 'Error: ' + chartData.error, File: '', Format: '', Width: '', Height: '' }];
    }

    if (format === 'png' && chartData.pngBase64) {
      fs.writeFileSync(outputPath, Buffer.from(chartData.pngBase64, 'base64'));
    } else {
      // SVG (or PNG fallback to SVG when canvas fails)
      const content = chartData.svgString;
      fs.writeFileSync(outputPath, content, 'utf-8');
    }

    return [{
      Status: 'Success',
      File: outputPath,
      Format: format === 'png' && chartData.pngBase64 ? 'png' : 'svg',
      Width: chartData.width,
      Height: chartData.height,
    }];
  },
});
