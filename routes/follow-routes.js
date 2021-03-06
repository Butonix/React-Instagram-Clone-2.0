const
  app = require('express').Router(),
  db = require('../config/db')

// TO CHECK IF SESSION FOLLOWING USER
app.post('/is-following', async (req, res) => {
  let {
      body: { username },
      session: { id: session }
    } = req,
    id = await db.getId(username),
    is = await db.isFollowing(session, id)
  res.json(is)
})

// FOLLOW
app.post('/follow', async (req, res) => {
  let
    { user, username } = req.body,
    { id: session, username: session_username } = req.session,
    isFollowing = await db.isFollowing(session, user),
    insert = {
      follow_by: session,
      follow_by_username: session_username,
      follow_to: user,
      follow_to_username: username,
      follow_time: new Date().getTime()
    }

  if (!isFollowing) {
    let
      { insertId } = await db.query('INSERT INTO follow_system SET ?', insert),
      firstname = await db.getWhat('firstname', session),
      surname = await db.getWhat('surname', session)

    res.json({
      mssg: `Followed ${username}!!`,
      success: true,
      ff: {
        follow_id: insertId,
        follow_by: session,
        username: session_username,
        firstname,
        surname,
        follow_to: user,
        follow_time: insert.follow_time
      }
    })
  } else {
    res.json({
      mssg: `Already followed ${username}!!`,
      success: false
    })
  }

})

// UNFOLLOW
app.post('/unfollow', async (req, res) => {
  let { session, body } = req
  await db.query('DELETE FROM follow_system WHERE follow_by=? AND follow_to=?', [ session.id, body.user ])
  res.json({ mssg: 'Unfollowed!!' })
})

// VIEW PROFILE
app.post('/view-profile', async (req, res) => {
  let
    { username } = req.body,
    { id: session } = req.session,
    id = await db.getId(username),
    [{ time: dtime }] = await db.query('SELECT MAX(view_time) as time FROM profile_views WHERE view_by=? AND view_to=?', [session, id]),
    time = parseInt(new Date().getTime() - parseInt(dtime))

  if (time >= 150000 || !dtime) {    // 120000 = 2.5 minutes
    let insert = {
      view_by: session,
      view_to: id,
      view_time: new Date().getTime()
    }
    await db.query('INSERT INTO profile_views SET ?', insert)
  }

  res.json('Hello, World!!')
})

// RETURNS FOLLOWERS OF A USER
const getFollowers = user => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT follow_system.follow_id, follow_system.follow_to, follow_system.follow_by, follow_system.follow_by_username AS username, users.firstname, users.surname, follow_system.follow_time FROM follow_system, users WHERE follow_system.follow_to=? AND follow_system.follow_by = users.id ORDER BY follow_system.follow_time DESC',
      [ user ]
    )
      .then(s => resolve(s))
      .catch(e => reject(e))
  })
}

// RETURNS FOLLOWINGS OF A USER
const getFollowings = user => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT follow_system.follow_id, follow_system.follow_to, follow_system.follow_by, follow_system.follow_to_username AS username, users.firstname, users.surname, follow_system.follow_time FROM follow_system, users WHERE follow_system.follow_by=? AND follow_system.follow_to = users.id ORDER BY follow_system.follow_time DESC',
      [ user ]
    )
      .then(s => resolve(s))
      .catch(e => reject(e))
  })
}

// GET USER STATS [FOLLOWERS/FOLLOWINGS/ETC..]
app.post('/get-user-stats', async (req, res) => {
  let
    { username } = req.body,
    id = await db.getId(username),

    followers = await getFollowers(id),
    followings = await getFollowings(id),
    [{ views_count }] = await db.query('SELECT COUNT(view_id) AS views_count FROM profile_views WHERE view_to=?', [ id ]),

    // favourites
    favourites = await db.query(
      'SELECT favourites.fav_id, favourites.fav_by, favourites.user, users.username, users.firstname, users.surname, favourites.fav_time FROM favourites, users WHERE favourites.fav_by = ? AND favourites.user = users.id ORDER BY favourites.fav_time DESC',
      [ id ]
    ),

    // recommendations
    _recommendations = await db.query(
      'SELECT recommendations.recommend_id, recommendations.recommend_of, users.username AS recommend_of_username, users.firstname AS recommend_of_firstname, users.surname AS recommend_of_surname, recommendations.recommend_to, recommendations.recommend_by, recommendations.recommend_time FROM recommendations, users WHERE recommendations.recommend_to = ? AND recommendations.recommend_of = users.id ORDER BY recommend_time DESC',
      [ id ]
    ),
    recommendations = []

  for (let r of _recommendations) {
    recommendations.push({
      ...r,
      recommend_by_username: await db.getWhat('username', r.recommend_by)
    })
  }

  res.json({
    followers,
    followings,
    views_count,
    favourites,
    recommendations
  })
})

// GET FOLLOWERS
app.post('/get-followers', async (req, res) => {
  let
    { user } = req.body,
    followers = await getFollowers(user)
  res.json(followers)
})

// GET FOLLOWINGS
app.post('/get-followings', async (req, res) => {
  let
    { user } = req.body,
    followings = await getFollowings(user)
  res.json(followings)
})

// SEARCH FOLLOWINGS
app.post('/search-followings', async (req, res) => {
  let
    { id } = req.session,
    data = await db.query(
      'SELECT DISTINCT follow_to, follow_to_username FROM follow_system WHERE follow_by=?',
      [ id ]
    )
  res.json(data)
})

// ADD TO FAVOURITES
app.post('/add-to-favourites', async (req, res) => {
  let
    { user } = req.body,
    { id } = req.session,
    username = await db.getWhat('username', user),
    favourite = await db.favouriteOrNot(id, user),
    fav = {
      fav_by: id,
      user,
      fav_time: new Date().getTime()
    }

  if (!favourite) {
    await db.query('INSERT INTO favourites SET ?', fav)
    res.json({
      mssg: `Added ${username} to favourites!!`,
      success: true
    })
  } else {
    res.json({
      mssg: `Already added ${username} to favourites!!`,
      success: false
    })
  }

})

// REMOVE FROM FAVOURITES
app.post('/remove-favourites', async (req, res) => {
  let
    { user } = req.body,
    { id } = req.session
  await db.query('DELETE FROM favourites WHERE fav_by=? AND user=?', [ id, user ])
  res.json('Hello, World!!')
})

// USERS TO RECOMMEND
app.post('/get-users-to-recommend', async (req, res) => {
  let
    { user } = req.body,
    { id } = req.session,
    users = await db.query(
      'SELECT follow_system.follow_id, follow_system.follow_to, follow_system.follow_to_username AS username, users.firstname, users.surname FROM follow_system, users WHERE follow_system.follow_by=? AND follow_system.follow_to = users.id AND follow_system.follow_to <> ? ORDER BY follow_system.follow_time DESC',
      [ id, user ]
    )

  res.json(users)
})

// RECOMMEND USER
app.post('/recommend-user', async (req, res) => {
  let
    { user, recommend_to } = req.body,
    { id: recommend_by } = req.session,
    recommend = {
      recommend_by,
      recommend_to,
      recommend_of: user,
      recommend_time: new Date().getTime()
    }
  await db.query('INSERT INTO recommendations SET ?', recommend)
  res.json('Hello, World!!')
})

// REMOVE RECOMMENDATION
app.post('/remove-recommendation', async (req, res) => {
  let { recommend_by, recommend_to, recommend_of } = req.body
  await db.query(
    'DELETE FROM recommendations WHERE recommend_by=? AND recommend_to=? AND recommend_of=?',
    [ recommend_by, recommend_to, recommend_of ]
  )
  res.json('Hello, World!!')
})

module.exports = app
