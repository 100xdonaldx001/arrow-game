window.ARROW_LEVELS = window.ARROW_LEVELS || [];
window.ARROW_LEVELS.push({
  id: 'level-3',
  name: 'Chain Reaction',
  snakes: [
    {
      dir: 'D',
      cells: [
        { x: 18, y: 4 },
        { x: 18, y: 3 },
        { x: 18, y: 2 }
      ]
    },
    {
      dir: 'L',
      cells: [
        { x: 18, y: 8 },
        { x: 19, y: 8 },
        { x: 20, y: 8 },
        { x: 21, y: 8 }
      ]
    },
    {
      dir: 'U',
      cells: [
        { x: 14, y: 8 },
        { x: 14, y: 9 },
        { x: 14, y: 10 }
      ]
    },
    {
      dir: 'R',
      cells: [
        { x: 14, y: 5 },
        { x: 13, y: 5 },
        { x: 12, y: 5 }
      ]
    },
    {
      dir: 'U',
      cells: [
        { x: 10, y: 5 },
        { x: 10, y: 6 },
        { x: 10, y: 7 }
      ]
    }
  ]
});
