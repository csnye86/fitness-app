require('dotenv').config()
const express =  require('express')
    , bodyParser = require('body-parser')
    , massive = require('massive')
    , passport = require('passport')
    , Auth0Session = require('passport-auth0')
    , session = require('express-session')
    , gc = require('./goalController')
    , uc = require('./userController')
    , wc = require('./workoutController')
    , nodemailer = require('nodemailer')
    , stripe = require("stripe")(process.env.STRIPE_KEY);

const {
  SERVER_PORT,
  SUCCESS_REDIRECT,
  FAILURE_REDIRECT,
  CONNECTION_STRING,
  SESSION_SECRET,
  DOMAIN,
  CLIENT_ID,
  CLIENT_SECRET,
  CALLBACK_URL,
  EMAIL,
  MAIL_PASSWORD
} = process.env


const app = express()

app.use(express.static( `${__dirname}/../build` ));
app.use(bodyParser.json())

massive(CONNECTION_STRING)
.then((db) => {
  console.log('Connected to database');
  app.set('db', db)
})

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}))
app.use(passport.initialize())
app.use(passport.session())
passport.use(new Auth0Session({
  domain: DOMAIN,
  clientID: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  callbackURL: CALLBACK_URL,
  scope: 'openid profile'
}, (accessToken, refreshToken, extraParams, profile, done) => {
  let db = app.get('db')
  let {displayName, picture, id} = profile
  db.find_user([id])
  .then((foundUser) => {
    if(foundUser[0]){
      done(null, foundUser[0].id)
    } else{
      db.create_user([displayName, picture, id])
      .then( (user) => {
        done(null, user[0].id)
      })
    }
  })
}))

passport.serializeUser((id, done) => {
  done(null, id)
})
passport.deserializeUser((id, done) => {
  app.get('db').find_session_user([id])
  .then((user) => {
    done(null, user[0])
  })
})

//ENDPOINTS

app.get('/login', passport.authenticate('auth0'))
app.get('/auth/callback', passport.authenticate('auth0', {
  successRedirect: SUCCESS_REDIRECT,
  failureRedirect: FAILURE_REDIRECT
}))
app.get('/auth/me', (req, res) => {
  if(req.user){
    res.status(200).send(req.user)
  } else {
    res.status(401).send('Please login')
  }
})
app.get('/goals', gc.getUserGoals)
app.post('/goals/new', gc.newGoal)
app.delete('/goals/delete/:id', gc.deleteGoal)
app.put('/goals/update/:goal_id', gc.updateGoal)
app.get('/user', uc.getProfInfo)
app.put('/user/update_age/:id', uc.editAge)
app.put('/user/update_height/:id', uc.editHeight)
app.put('/user/update_weight/:id', uc.editWeight)
app.post('/workout/new', wc.newWorkout)
app.get('/workout', wc.getWorkouts)

// NODEMAILER 

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL,
    pass: MAIL_PASSWORD
  }
})

app.post('/email', (req, res, next) => {
  const {senderName, senderEmail, message, subject} = req.body
  let mail = {
    from: EMAIL,
    to: EMAIL,
    subject: subject,
    html: "Name: " + senderName + "<br/> Message: " + message + "<br/>" + "Respond to: " + senderEmail
  }
  transporter.sendMail(mail, (error, response) => {
    if(error){
        console.log("Error sending email");
        console.log(error);
    }else {
        console.log("Email Sent!")
    }
    transporter.close();
})
res.sendStatus(201);
})

// STRIPE

app.post('/api/payment', function(req, res, next){
  // convert amount to pennies
  const amountArray = req.body.amount.toString().split('');
  const pennies = [];
  for (var i = 0; i < amountArray.length; i++) {
    if(amountArray[i] === ".") {
      if (typeof amountArray[i + 1] === "string") {
        pennies.push(amountArray[i + 1]);
      } else {
        pennies.push("0");
      }
      if (typeof amountArray[i + 2] === "string") {
        pennies.push(amountArray[i + 2]);
      } else {
        pennies.push("0");
      }
        break;
    } else {
        pennies.push(amountArray[i])
    }
  }
  const convertedAmt = parseInt(pennies.join(''));

  const charge = stripe.charges.create({
      amount: convertedAmt, // amount in cents, again
      currency: 'usd',
      source: req.body.token.id,
      description: 'Test charge from react app'
  }, function(err, charge) {
      if (err) return res.sendStatus(500)
      return res.sendStatus(200);
      // if (err && err.type === 'StripeCardError') {
      //   // The card has been declined
      // }
  });
});


app.listen(SERVER_PORT, console.log(`Docked at port ${SERVER_PORT} 🎸`))