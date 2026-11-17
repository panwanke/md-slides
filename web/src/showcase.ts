import content from '../../demo/showcase.md?raw';

export const showcase = {
  filename: 'showcase.md',
  title: 'Markdown ⇄ HTML 演示全景',
  content: content.replace(/\r\n?/g, '\n'),
};
