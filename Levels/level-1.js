window.ARROW_LEVELS = window.ARROW_LEVELS || [];
window.ARROW_LEVELS.push({
  id: 'level-1',
  name: 'Clear the Lane',
  snakes: [
    {
      dir: 'R',
      cells: [
        { x: 6, y: 5 },
        { x: 5, y: 5 },
        { x: 4, y: 5 }
      ]
    },
    {
      dir: 'U',
      cells: [
        { x: 10, y: 5 },
        { x: 10, y: 6 },
        { x: 10, y: 7 }
      ]
    },
    {
      dir: 'L',
      cells: [
        { x: 10, y: 2 },
        { x: 11, y: 2 },
        { x: 12, y: 2 }
      ]
    }
  ]
});
