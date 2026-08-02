```plaintext
mil-toolkit-backend/
├── app/
│   ├── __init__.py
│   ├── entrypoint.py          # Main API/Execution entry point
│   ├── nlp/                   # NLP Core (The Shield)
│   │   ├── __init__.py
│   │   ├── helper.py          # Pre-processing text (cleaning/normalization)
│   │   ├── importer.py        # Loading local NLP models (e.g., ONNX/TensorFlow)
│   │   └── processor.py       # Inference logic
│   ├── modules/               # The Core (Gamification & Logic)
│   │   ├── __init__.py
│   │   ├── gamify.py          # Logic for badges/XP triggers
│   │   ├── point_calc.py      # Logic for rewarding user feedback
│   │   └── point_calibrate.py # Smoothing/balancing mechanics
│   ├── database/              # The Data Layer (Telemetry & ChromaDB)
│   │   ├── __init__.py
│   │   ├── chromadb_client.py # Class to handle CRUD ops for embeddings
│   │   └── telemetry.py       # Aggregation logic for community reports
│   └── utils/                 # General helpers
├── data/                      # Local storage/models
├── requirements.txt
└── README.md
```

The formula of correctioness and exponential moving average

$$B_{new}=\alpha.\bar{Y} + (1-\alpha).B_{old}$$

With:
- $B_{new}$: The updated Shared Knowledge Baseline for a specific threat category.
- $\alpha$: The learning rate (e.g., $0.15$), determining how quickly the community baseline adapts to new feedback.
- $\bar{Y}$: The `youth_correction_average` from the incoming anonymized batch.
- $B_{old}$: The previous baseline stored in the cloud.