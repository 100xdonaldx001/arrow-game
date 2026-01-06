window.ARROW_LEVELS = window.ARROW_LEVELS || [];
window.ARROW_LEVELS.push({
  id: 'level-2',
  name: 'Cross Traffic',
  snakes: [
    {
      dir: 'U',
      cells: [
        { x: 8, y: 14 },
        { x: 8, y: 15 },
        { x: 8, y: 16 }
      ]
    },
    {
      dir: 'R',
      cells: [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 }
      ]
    },
    {
      dir: 'D',
      cells: [
        { x: 12, y: 10 },
        { x: 12, y: 9 },
        { x: 12, y: 8 }
      ]
    },
    {
      dir: 'L',
      cells: [
        { x: 12, y: 13 },
        { x: 13, y: 13 },
        { x: 14, y: 13 }
      ]
    }
  ]
});
