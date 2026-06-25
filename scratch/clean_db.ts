import { StateDB } from '../bot/database';

console.log("Eski veritabanı kayıtları temizleniyor...");
StateDB.resetDatabase();
console.log("Veritabanı temizlendi.");
