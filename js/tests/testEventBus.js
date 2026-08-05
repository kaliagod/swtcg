import EventBus from "../services/EventBus.js";

const bus = new EventBus();

console.log("=== Test Start ===");

bus.on("HELLO", (payload) => {

    console.log("on:", payload.message);

});

bus.emit("HELLO", {

    message: "Hello World"

});

bus.once("ONCE", (payload) => {

    console.log("once:", payload.value);

});

bus.emit("ONCE", {

    value: 100

});

bus.emit("ONCE", {

    value: 200

});

console.log("=== Test End ===");