class Acoustic {
  constructor(urlOrAudioElement, options = {}) {
    this.options = options;
    this.fftSize = options.fftSize || 512;
    this.filters = options.filters || this.getDefaultFilters();

    this.audio = this.initAudio(urlOrAudioElement);
    this.currentTime = 0;
    this.playing = false;

    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.context.createMediaElementSource(this.audio);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.samples = this.analyser.frequencyBinCount;

    // create delay to compensate fftSize lag
    if (this.context.createDelay) {
      this.delay = this.context.createDelay();
    }
    else {
      this.delay = this.context.createDelayNode();
    }
    this.delay.delayTime.value = this.fftSize * 2 / this.context.sampleRate;

    // Create a data variable for main analyer and filters.
    this.data = {
      timeDomainData: new Uint8Array(this.samples),
      timeDomainRMS: 0,
      filters: {}
    };

    // Connect audio processing nodes.
    this.source.connect(this.analyser);
    this.analyser.connect(this.delay);
    this.delay.connect(this.context.destination);

    // Create webaudio nodes for filters.
    this.filters = this.initFilters(this.filters, this.data);
  }

  initAudio(urlOrAudioElement) {
    let audio = false;
    if (typeof urlOrAudioElement === 'string') {
      audio = new Audio(urlOrAudioElement);
    }
    else {
      audio = urlOrAudioElement;
    }

    audio.addEventListener('canplay', () => {
      if (this.options.onCanPlay) {
        this.options.onCanPlay(this);
      }
    });

    return audio;
  }

  update() {
    if (!this.playing) {
      return;
    }
    let self = this;

    this.analyser.smoothingTimeConstant = false;
    this.analyser.getByteTimeDomainData(this.data.timeDomainData);

    this.data.timeDomainRMS = this.rms(this.data.timeDomainData);

    Object.keys(this.filters).forEach(function iterateFilters(key) {
      let item = self.filters[key];
      let itemData = self.data.filters[key];
      item.analyserNode.fftSize = self.fftSize;
      item.analyserNode.getByteTimeDomainData(itemData.timeDomainData);
      // Smooth intensity.
      itemData.timeDomainRMS += (self.rms(itemData.timeDomainData) - itemData.timeDomainRMS) * 0.4;
    });
  }

  rms(data) {
    let size = data.length;
    let accumulation = 0;
    for (let i = 0; i < size; i++) {
      //let intensity = data[i];
      let intensity = Math.abs(data[i] - 128);
      accumulation += intensity * intensity;
    }

    return Math.sqrt(accumulation / size);
  }

  play() {
    if (this.audio) {
      this.playing = true;
      this.audio.play();
      this.audio.currentTime = this.currentTime;
    }
  }

  pause() {
    if (this.audio) {
      this.playing = false;
      this.audio.pause();
    }
  }

  seek(seconds) {
    this.currentTime = seconds;
    if (this.audio && this.audio.paused === false) {
      this.audio.currentTime = this.currentTime;
    }
  }

  getValue(filterName) {
    let val;
    if (!filterName) {
      val = this.data.timeDomainRMS;
    }
    else if (this.data.filters[filterName] !== undefined) {
      val = this.data.filters[filterName].timeDomainRMS;
    }
    return val;
  }

  initFilters(filters, data) {
    let self = this;
    Object.keys(filters).forEach(function iterateFilters(key) {
      let item = filters[key];
      // Create the lowpass/bandpass/highpass filters.
      item.biquadFilter = self.context.createBiquadFilter();
      item.biquadFilter.type = item.type;
      item.biquadFilter.frequency.value = item.frequency;
      item.biquadFilter.Q.value = item.Q;

      item.analyserNode = self.context.createAnalyser();
      item.analyserNode.fftSize = self.fftSize;

      if (self.context.createGain) {
        item.gainNode = self.context.createGain();
      }
      else {
        item.gainNode = self.context.createGainNode();
      }
      item.gainNode.gain.value = item.gain;

      // Connect filters audio processing nodes.
      self.source.connect(item.gainNode);
      item.gainNode.connect(item.biquadFilter);
      item.biquadFilter.connect(item.analyserNode);

      // Prepare data.
      data.filters[key] = {
        timeDomainData: new Uint8Array(self.samples),
        timeDomainRMS: 0
      };
    });
    return filters;
  }

  getDefaultFilters() {
    return {
      bass: {
        type: 'lowpass',
        frequency: 120,
        Q: 1.2,
        gain: 12
      },
      mid: {
        type: 'bandpass',
        frequency: 400,
        Q: 1.2,
        gain: 12
      },
      high: {
        type: 'highpass',
        frequency: 2000,
        Q: 1.2,
        gain: 12
      }
    };
  }
}

module.exports = Acoustic;
