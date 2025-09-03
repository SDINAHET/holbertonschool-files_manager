import redisClient from './utils/redis';

const waitReady = () =>
  new Promise((resolve) => redisClient.client.once('ready', resolve));

(async () => {
    await waitReady();                      // ← attend la connexion
    console.log(redisClient.isAlive());
    console.log(await redisClient.get('myKey'));
    await redisClient.set('myKey', 12, 5);
    console.log(await redisClient.get('myKey'));

    setTimeout(async () => {
        console.log(await redisClient.get('myKey'));
    }, 1000*10)
})();
