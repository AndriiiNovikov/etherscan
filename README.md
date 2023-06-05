# etherscan-parsing

Для запуска:
- Потрібен встановлений node.js
- npm i
- node index.js <startindex> <endindex>
  startindex, endindex - стартовий та кінцевий індекс обчислення транзакцій. Для невеликих об'ємів достатньо такої команди: node index.js 0 20000. Якщо транзакцій більше, то треба виконувати команду декілька разів (20000 40000; 40000 60000; тощо). Такі обмеження обргрунтовуються обмеженою кількістю оперативної пам'яті для виконання програми.

Файл config.json:
- addresses - масив з адрес (для кращого результату поки що пропонується ставити тільки одну)
- apiKey - головний ключ до etherscan api
- apiReserved - масив ключей які використовуються для більш швидкого скану транзакцій
- tempDir - папка тимчасового результату
- startDate, endDate - дати скану