## 1. A synopsis of your project goal(s)

Sisyphus’ Schedule is a machine-learning-powered fitness web application designed to streamline workout planning and tracking. The core goal is to generate personalized weekly workout plans tailored to a user’s specific fitness profile, which includes their gender, age, weight, experience level, and primary goals (such as bulking, cutting, or gaining strength). The app aims to keep users engaged by allowing them to "like" or "dislike" exercises, automatically swapping disliked movements for suitable alternatives based on the same muscle group. Additionally, it aims to provide a comprehensive fitness experience by including a macro and nutrition tracker.

---

## 2. Link to all written status updates

- Status Update 1: https://github.com/COSC49505X2025/FlexAppeal/blob/main/status/status1.md  
- Status Update 2: https://github.com/COSC49505X2025/FlexAppeal/blob/main/status/status2.md  
- Status Update 3: https://github.com/COSC49505X2025/FlexAppeal/blob/main/status/status3.md  
- Status Update 4: https://github.com/COSC49505X2025/FlexAppeal/blob/main/status/status4.md  
- Status Update 5: https://github.com/COSC49505X2025/FlexAppeal/blob/main/status/status5.md  
- Status Update 6: https://github.com/COSC49505X2025/FlexAppeal/blob/main/status/status6.md  

---

## 3. Links to all videos created (see other assignments)

https://drive.google.com/file/d/1Mpxb22S1_YNXAg642BoXj_lLPhFL8vmL/view?usp=drivesdk

---

## 4. Project Planning and Execution

### 4.1 Link to (or markdown version of) Design Requirements & Specification

https://github.com/COSC49505X2025/FlexAppeal/blob/main/planning/final.pdf

### 4.2 A brief descriptions of changes

We hit just about all our goals but we did go in a few different directions then we originally thought:

**Post-Workout Questionnaires:** Originally intended to evaluate generator performance; not implemented beyond basic like/dislike feedback. We never followed through with BetaTesting so we had limited user feedback.

**Recovery Features:** We had mentioned adding this in planning but no dedicated recovery tracking (e.g., soreness, rest guidance) was built. This is a tough feature to add because of subject to subject nuance.

---

## 5. Summary of Final Implementation: Most of which was what you said in the presentation.

### 5.1 Design and Limitations (summary, a couple of sentences)

Our application is a web-based fitness platform built on a Tailwind CSS front end, a Supabase/PostgreSQL backend, and a machine-learning workout generator using a Random Forest model with synthetic data. It includes integrated workout planning, scheduling, logging, nutrition tracking via the USDA API, and social features.

Key limitations include the absence of post-workout feedback mechanisms beyond simple like/dislike reactions, limiting iterative improvement of the generator, and the lack of recovery and cardio tracking features due to their subjective complexity.

### 5.2 Future Direction

Moving forward, the primary technical goal is to officially migrate the application's infrastructure from Supabase to AWS.  

To improve the workout generation algorithm, we plan to implement an SVD-Factorization Matrix Model and integrate a dedicated Exercise API to feed more comprehensive data into the model.  

Some other future considerations are automating progressive overload (adjusting sets, weights, and reps based on user achievements) and adding functionality to guide users through long-term training blocks to better manage cumulative fatigue.

---

## 5.3 Statement of Work - What each team member was responsible for

- **Nolan:** I worked with thomas to integrate the supabase database and then hookup the USDA nutrition API. This included things like authentication, the actual functionality of logging your workouts, the social aspects, logging food, the weigh in, and adding the functionality to allow users to add custom plans/workouts manually. I also deployed the app using github actions to build and deploy the static files from our private repo to a public repo connected to a custom domain I setup. I also worked on SEO to try and get it listed on google.

- **Lily:** I worked on the frontend and user interface. This included overall layout, functionality and ease of use, as well as implementing feedback from user testing. I worked with my group members on issues that we had found in meetings and on our own which gave me insight into the databse work and how our app truly functioned.

- **Collin:** I worked mostly on the Machine Learning model, making sure that the model would generate workouts based on the user's fitness profile. I also worked with Nolan and Thomas a little to make sure I could pull data from the database to feed our model with live data so that it could better generate personalized workouts for the users. I also got feedback from my group members on little things that can be improved or added to make our model stand out.

- **Thomas:** I worked with Nolan on managing the database and making sure schemas aligned with our code. I also worked on creating save functionality for ML generated workouts, created the circular nutrition progress UI element that populates throughout the user's schedule, and other miscellaneous tasks. A bulk of my work was debugging a lot of features in our code that showed up throughout the progression of our project. We also, as a group, decided on a lot of changes to the layout of our webapp several times, which I would then implement a lot of those changes.
