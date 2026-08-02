# Introduction
This project is the submission of UNESCO Youth hackathon, targeted the Information and Media Literacy (MIL) - addressing challenges in the scope of information & media misconducted, propaganda spreading, fake new, digital abuse/harassment,...

The current idea focuses on hated and harassment speech via social network (or in a wider scope: cyberspace). Since nowadays, the sarcasm is commonly used as a disguised for the abuse/harassment, or somebody simply says "It's a joke, no need to make a fuss". Thus, the best approach and maybe the most suitable idea to deal with it is educating. Via this solution, users (let say, youths all around the world, but start with Vietnam, where the social network is a place that many hate speechs and harassment comments are sent everyday).

# Flow
The final solution has 3 main purpose:

- **Education**: raise the awarness about what is a hated speech, or what is a harassment/abuse comment looks like. By gradually show and flag the malicious contents, the "recognitop" bar will be increased steadily.
- **Engagement**: language is one of the most flexible and complex invention of the humankind, so there is no impossible way to construct a centralized database for pattern-matching purpose, hence the best way to enrich and ensure that every threats would be captured and flagged is "community engagment". After fully (or at least having solid foundation) via education functionality, users can now contribute to a common-shared-knowledge. Now the core will only act as a baseline for user's input, and if that input is missing from the base, it will be updated into the community database, providing the baseline for another thoudsands users.
- **Encouragement**: if you are good at anything, do not do it free. As a grantitude for the meaningful contribute, a reward system must be implemented. The prizes are various, raging for some accesories in the user's profile, to tickets and invitations to dedicated conference about MIL and in the future, a mentor program, for who wants to contribute for the society.

# Project structure:

```plaintext
mil-toolkit-backend/
├── backend/                   # Core logic, written in Python, must have ONNX core
├── frontend/                  # Visualization layer, crawls and sends data to backend
├── tests/                     # Contains automation test scenarios
└── README.md
```

# Status

- [**Backend**](backend/README.md): Complete the skeletal logic, including create, load, handle NLP core, supports data definition, manifestation,... In addition, helper function to frame, sanitize data is also included
- [**Frontend**](../steam/harassment-detector/extension/): To-be-added, refer to old project (the STEAM) for more information, migration-in-progress