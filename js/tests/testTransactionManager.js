import TransactionManager from "../services/TransactionManager.js";

const tx = new TransactionManager();

console.log("=== TransactionManager Test ===");

let value = 10;

console.log("初期値:", value);

tx.begin();

value += 5;

tx.addOperation(() => {
    value -= 5;
});

console.log("変更後:", value);

tx.rollback();

console.log("Rollback後:", value);

tx.begin();

value += 20;

tx.addOperation(() => {
    value -= 20;
});

tx.commit();

console.log("Commit後:", value);

console.log("Transaction Active:", tx.isActive());