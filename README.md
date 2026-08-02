# Introduction
This is submission of team Vinare for UNESCO Youth Hackathon 2026 for Media and Information Literacy. Solution for this contest is a framework that helps Youth can protect themselves. Especially for girls and women.

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

- **[backend](backend/README.md)** this is the logical behind the software. It ultilizes 2 famous models in recognizing and extracting Vietnamese words in a text or a paragraph. Credits for these model belongs to [VinAI/PhoBert](https://huggingface.co/vinai/phobert-base-v2)

- **[frontend](frontend/README.md)** a web extension, can be imported into Chromium-based browsers (Google Chrome, Microsoft Edge,...), providing a user-interface, lables data for logical processing, providing alert about harassment speechs,...

- **[installation](installation)** contains 2 automatically install scripts for Windows and Mac. The script will download necessary software (Python, Git) then installs it to user's machine.

# Disclaimer

Currently, the Cloud feature (community-based knowledge library) is not supported, so all the data will be kept in the local machine. Development team labeled and classified about 230 samples for harassment and hated speech. These material will be used in the seeding process, providing initial baseline for detection.

During installation process, the script will call some lesser scripts to init the database and put data into it.

# How to install

Navigate to Release, currently it is version `1.0.0`, take the correct script, and the requirement file if necessary. Then run the script. It is recommended to run it under administrator privilege since it will install `Git` and `Python`, then adding these tools to the system variable under `$PATH`, normal user probably could not satisfy this step.
