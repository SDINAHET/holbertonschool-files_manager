#!/bin/bash
# Lance le serveur
npm run start-server &
SERVER_PID=$!

# Attend 2 secondes pour qu'il démarre
sleep 25

# Lance le test spécifique
npm test hbtn_test_5.test.cjs

# Stoppe le serveur
kill $SERVER_PID
