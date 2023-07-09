const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let port = 3000;
let db = null;
const initializeSeverAndDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(port, () => {
      console.log(`this sever is running at PORT: ${port}`);
    });
  } catch (e) {
    console.log(`DB error: ${e.message}`);
  }
};
initializeSeverAndDatabase();

// authenticate user
const authenticate = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRETE", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  }
};

// register user
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const isPresent = await db.get(checkUserQuery);
  if (isPresent === undefined) {
    if (password.length >= 6) {
      const createUserQuery = `
        INSERT INTO
            user (username, password, name, gender)
        VALUES ('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// user login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const isPresent = await db.get(checkUserQuery);
  if (isPresent !== undefined) {
    const isPasswordChecked = await bcrypt.compare(
      password,
      isPresent.password
    );
    if (isPasswordChecked === true) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "SECRETE");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// /user/tweets/feed/
app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  const { username } = request;
  const getUsersQuery = `
    SELECT follower_user_id as followerUserId FROM (user INNER JOIN follower ON user.user_id = follower.follower_user_id) WHERE username = '${username}';`;
  const user = await db.get(getUsersQuery);
  const { followerUserId } = user;
  console.log(followerUserId);
  const getTweetQuery = `
  SELECT username, tweet, date_time as dateTime FROM (follower INNER JOIN user ON user.user_id = follower.following_user_id) AS T INNER JOIN tweet ON T.user_id = tweet.user_id WHERE follower.follower_user_id = '${followerUserId}'
  ORDER BY dateTime DESC
  LIMIT 4
  OFFSET 0;`;
  const dbRes = await db.all(getTweetQuery);
  response.send(dbRes);
});

// user following
app.get("/user/following/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
  SELECT follower_user_id as followerUserId FROM user LEFT JOIN follower ON user.user_id = follower.follower_user_id WHERE username = '${username}';`;
  const users = await db.get(getUserQuery);
  const { followerUserId } = users;
  console.log(followerUserId);
  const getFollowerQuery = `
  SELECT name FROM follower INNER JOIN user ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = '${followerUserId}'`;
  const dbRes = await db.all(getFollowerQuery);
  response.send(dbRes);
});
// user followers
app.get("/user/followers/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
  SELECT follower_user_id as followerUserId FROM user LEFT JOIN follower ON user.user_id = follower.follower_user_id WHERE username = '${username}';`;
  const users = await db.get(getUserQuery);
  const { followerUserId } = users;
  const getFollowersQuery = `
  SELECT name FROM user LEFT JOIN follower ON user.user_id = follower.follower_id WHERE follower.follower_user_id = '${followerUserId}';`;
  const dbRes = await db.all(getFollowersQuery);
  response.send(dbRes);
});

// /tweets/:tweetId/
app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserQuery = `
  SELECT follower_user_id as followerUserId FROM user LEFT JOIN follower ON user.user_id = follower.follower_user_id WHERE username = '${username}';`;
  const users = await db.get(getUserQuery);
  const { followerUserId } = users;
  const getTweetQuery = `
  SELECT tweet_id as tweetId FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) WHERE tweet_id = '${tweetId}' AND follower.follower_user_id = '${followerUserId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweetId } = tweet;
    const getTweetsQuery = `
    SELECT tweet, SUM(like_id) as likes, SUM(reply_id) as replies, date_time as dateTime FROM (tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T LEFT JOIN like ON T.tweet_id = like.tweet_id WHERE tweet.tweet_id = '${tweetId}';`;
    const tweetDetails = await db.all(getTweetsQuery);
    response.send(tweetDetails);
  }
});

// /tweets/:tweetId/likes/
app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserQuery = `
  SELECT follower_user_id as followerUserId FROM user LEFT JOIN follower ON user.user_id = follower.follower_user_id WHERE username = '${username}';`;
  const users = await db.get(getUserQuery);
  const { followerUserId } = users;
  const getTweetQuery = `
  SELECT tweet_id as tweetId FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) WHERE tweet_id = '${tweetId}' AND follower.follower_user_id = '${followerUserId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetsQuery = `
  SELECT T.name FROM (user INNER JOIN follower ON follower.following_user_id = user.user_id) AS T INNER JOIN like ON like.user_id = T.user_id WHERE tweet_id = '${tweetId}' AND follower.follower_user_id = '${followerUserId}';`;
    const likes = await db.all(getTweetsQuery);
    const { name } = likes;
    response.send({ likes });
  }
});

// /tweets/:tweetId/replies/
app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `
  SELECT follower_user_id as followerUserId FROM user LEFT JOIN follower ON user.user_id = follower.follower_user_id WHERE username = '${username}';`;
    const users = await db.get(getUserQuery);
    const { followerUserId } = users;
    const getTweetQuery = `
  SELECT tweet_id as tweetId FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) WHERE tweet_id = '${tweetId}' AND follower.follower_user_id = '${followerUserId}';`;
    const tweet = await db.get(getTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetsQuery = `
  SELECT name, reply FROM (user INNER JOIN follower ON follower.following_user_id = user.user_id) AS T INNER JOIN reply ON reply.user_id = T.user_id WHERE tweet_id = '${tweetId}' AND follower.follower_user_id = '${followerUserId}';`;
      const replies = await db.all(getTweetsQuery);
      response.send({ replies });
    }
  }
);

///user/tweets/
app.get("/user/tweets/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
  SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const { userId } = await db.get(getUserQuery);
  const getUserTweetsQuery = `
  SELECT tweet, COUNT(like_id) as likes, COUNT(reply_id) as replies, date_time as dateTime FROM (tweet INNER JOIN like ON like.user_id = tweet.user_id) AS T INNER JOIN reply ON T.user_id = reply.user_id WHERE tweet.user_id = '${userId}';`;
  const userTweets = await db.all(getUserTweetsQuery);
  response.send(userTweets);
});

// proto user/tweets code
app.get("/proto/tweets/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
  SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const { userId } = await db.get(getUserQuery);
  const getUserTweetsQuery = `
  SELECT *  FROM tweet WHERE tweet.user_id = '${userId}';`;
  const userTweets = await db.all(getUserTweetsQuery);
  response.send(userTweets);
});

///user/tweets/ Create
app.post("/user/tweets/", authenticate, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserQuery = `
  SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const { userId } = await db.get(getUserQuery);
  const date = new Date();
  const currentDate = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  console.log(currentDate);
  const createTweetQuery = `
  INSERT INTO tweet (tweet, user_id, date_time)
VALUES ('${tweet}','${userId}','${currentDate}');
  `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

///tweets/:tweetId/ delete
app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserQuery = `
  SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const { userId } = await db.get(getUserQuery);
  const checkingUserTweetQuery = `
  SELECT tweet_id as twtId FROM tweet WHERE tweet.tweet_id = '${tweetId}' AND tweet.user_id = '${userId}';`;
  const twtId = await db.get(checkingUserTweetQuery);
//   response.send(twtId);
  if (twtId === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteUserTweetQuery = `
  DELETE FROM tweet WHERE tweet.tweet_id = '${twtId}';`;
    await db.run(deleteUserTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
