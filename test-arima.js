const ARIMA = require('arima');
const arima = new ARIMA({ p: 1, d: 1, q: 1 }).train([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
console.log(arima.predict(5));
