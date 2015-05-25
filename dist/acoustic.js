(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Acoustic = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Acoustic = (function () {
  function Acoustic(urlOrAudioElement) {
    var options = arguments[1] === undefined ? {} : arguments[1];

    _classCallCheck(this, Acoustic);

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
    } else {
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

  Acoustic.prototype.initAudio = function initAudio(urlOrAudioElement) {
    var _this = this;

    var audio = false;
    if (typeof urlOrAudioElement === 'string') {
      audio = new Audio(urlOrAudioElement);
    } else {
      audio = urlOrAudioElement;
    }

    audio.addEventListener('canplay', function () {
      if (_this.options.onCanPlay) {
        _this.options.onCanPlay(_this);
      }
    });

    return audio;
  };

  Acoustic.prototype.update = function update() {
    if (!this.playing) {
      return;
    }
    var self = this;

    this.analyser.smoothingTimeConstant = false;
    this.analyser.getByteTimeDomainData(this.data.timeDomainData);

    this.data.timeDomainRMS = this.rms(this.data.timeDomainData);

    Object.keys(this.filters).forEach(function iterateFilters(key) {
      var item = self.filters[key];
      var itemData = self.data.filters[key];
      item.analyserNode.fftSize = self.fftSize;
      item.analyserNode.getByteTimeDomainData(itemData.timeDomainData);
      // Smooth intensity.
      itemData.timeDomainRMS += (self.rms(itemData.timeDomainData) - itemData.timeDomainRMS) * 0.4;
    });
  };

  Acoustic.prototype.rms = function rms(data) {
    var size = data.length;
    var accumulation = 0;
    for (var i = 0; i < size; i++) {
      //let intensity = data[i];
      var intensity = Math.abs(data[i] - 128);
      accumulation += intensity * intensity;
    }

    return Math.sqrt(accumulation / size);
  };

  Acoustic.prototype.play = function play() {
    if (this.audio) {
      this.playing = true;
      this.audio.play();
      this.audio.currentTime = this.currentTime;
    }
  };

  Acoustic.prototype.pause = function pause() {
    if (this.audio) {
      this.playing = false;
      this.audio.pause();
    }
  };

  Acoustic.prototype.seek = function seek(seconds) {
    this.currentTime = seconds;
    if (this.audio && this.audio.paused === false) {
      this.audio.currentTime = this.currentTime;
    }
  };

  Acoustic.prototype.getValue = function getValue(filterName) {
    var val = undefined;
    if (!filterName) {
      val = this.data.timeDomainRMS;
    } else if (this.data.filters[filterName] !== undefined) {
      val = this.data.filters[filterName].timeDomainRMS;
    }
    return val;
  };

  Acoustic.prototype.initFilters = function initFilters(filters, data) {
    var self = this;
    Object.keys(filters).forEach(function iterateFilters(key) {
      var item = filters[key];
      // Create the lowpass/bandpass/highpass filters.
      item.biquadFilter = self.context.createBiquadFilter();
      item.biquadFilter.type = item.type;
      item.biquadFilter.frequency.value = item.frequency;
      item.biquadFilter.Q.value = item.Q;

      item.analyserNode = self.context.createAnalyser();
      item.analyserNode.fftSize = self.fftSize;

      if (self.context.createGain) {
        item.gainNode = self.context.createGain();
      } else {
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
  };

  Acoustic.prototype.getDefaultFilters = function getDefaultFilters() {
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
  };

  return Acoustic;
})();

module.exports = Acoustic;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZGF2aWQvRGVza3RvcC8wMS5jbGllbnRzL2dpdC9hY291c3RpYy5qcy9zcmMvYWNvdXN0aWMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0lDQU0sUUFBUTtBQUNELFdBRFAsUUFBUSxDQUNBLGlCQUFpQixFQUFnQjtRQUFkLE9BQU8sZ0NBQUcsRUFBRTs7MEJBRHZDLFFBQVE7O0FBRVYsUUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7QUFDdkIsUUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxJQUFJLEdBQUcsQ0FBQztBQUN0QyxRQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7O0FBRTNELFFBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBQy9DLFFBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ3JCLFFBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDOztBQUVyQixRQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssTUFBTSxDQUFDLFlBQVksSUFBSSxNQUFNLENBQUMsa0JBQWtCLENBQUEsRUFBRyxDQUFDO0FBQ3hFLFFBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDaEUsUUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzlDLFFBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7QUFDckMsUUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDOzs7QUFHL0MsUUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRTtBQUM1QixVQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7S0FDekMsTUFDSTtBQUNILFVBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztLQUM3QztBQUNELFFBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQzs7O0FBR3hFLFFBQUksQ0FBQyxJQUFJLEdBQUc7QUFDVixvQkFBYyxFQUFFLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7QUFDNUMsbUJBQWEsRUFBRSxDQUFDO0FBQ2hCLGFBQU8sRUFBRSxFQUFFO0tBQ1osQ0FBQzs7O0FBR0YsUUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ25DLFFBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNsQyxRQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDOzs7QUFHN0MsUUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0dBQzFEOztBQXZDRyxVQUFRLFdBeUNaLFNBQVMsR0FBQSxtQkFBQyxpQkFBaUIsRUFBRTs7O0FBQzNCLFFBQUksS0FBSyxHQUFHLEtBQUssQ0FBQztBQUNsQixRQUFJLE9BQU8saUJBQWlCLEtBQUssUUFBUSxFQUFFO0FBQ3pDLFdBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0tBQ3RDLE1BQ0k7QUFDSCxXQUFLLEdBQUcsaUJBQWlCLENBQUM7S0FDM0I7O0FBRUQsU0FBSyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxZQUFNO0FBQ3RDLFVBQUksTUFBSyxPQUFPLENBQUMsU0FBUyxFQUFFO0FBQzFCLGNBQUssT0FBTyxDQUFDLFNBQVMsT0FBTSxDQUFDO09BQzlCO0tBQ0YsQ0FBQyxDQUFDOztBQUVILFdBQU8sS0FBSyxDQUFDO0dBQ2Q7O0FBekRHLFVBQVEsV0EyRFosTUFBTSxHQUFBLGtCQUFHO0FBQ1AsUUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDakIsYUFBTztLQUNSO0FBQ0QsUUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDOztBQUVoQixRQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQztBQUM1QyxRQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7O0FBRTlELFFBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQzs7QUFFN0QsVUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsY0FBYyxDQUFDLEdBQUcsRUFBRTtBQUM3RCxVQUFJLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzdCLFVBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3RDLFVBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7QUFDekMsVUFBSSxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7O0FBRWpFLGNBQVEsQ0FBQyxhQUFhLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFBLEdBQUksR0FBRyxDQUFDO0tBQzlGLENBQUMsQ0FBQztHQUNKOztBQTlFRyxVQUFRLFdBZ0ZaLEdBQUcsR0FBQSxhQUFDLElBQUksRUFBRTtBQUNSLFFBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7QUFDdkIsUUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBQ3JCLFNBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7O0FBRTdCLFVBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ3hDLGtCQUFZLElBQUksU0FBUyxHQUFHLFNBQVMsQ0FBQztLQUN2Qzs7QUFFRCxXQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxDQUFDO0dBQ3ZDOztBQTFGRyxVQUFRLFdBNEZaLElBQUksR0FBQSxnQkFBRztBQUNMLFFBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtBQUNkLFVBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO0FBQ3BCLFVBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDbEIsVUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztLQUMzQztHQUNGOztBQWxHRyxVQUFRLFdBb0daLEtBQUssR0FBQSxpQkFBRztBQUNOLFFBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtBQUNkLFVBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO0FBQ3JCLFVBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7S0FDcEI7R0FDRjs7QUF6R0csVUFBUSxXQTJHWixJQUFJLEdBQUEsY0FBQyxPQUFPLEVBQUU7QUFDWixRQUFJLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQztBQUMzQixRQUFJLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssS0FBSyxFQUFFO0FBQzdDLFVBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7S0FDM0M7R0FDRjs7QUFoSEcsVUFBUSxXQWtIWixRQUFRLEdBQUEsa0JBQUMsVUFBVSxFQUFFO0FBQ25CLFFBQUksR0FBRyxZQUFBLENBQUM7QUFDUixRQUFJLENBQUMsVUFBVSxFQUFFO0FBQ2YsU0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO0tBQy9CLE1BQ0ksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSyxTQUFTLEVBQUU7QUFDcEQsU0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLGFBQWEsQ0FBQztLQUNuRDtBQUNELFdBQU8sR0FBRyxDQUFDO0dBQ1o7O0FBM0hHLFVBQVEsV0E2SFosV0FBVyxHQUFBLHFCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDekIsUUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLFVBQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsY0FBYyxDQUFDLEdBQUcsRUFBRTtBQUN4RCxVQUFJLElBQUksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7O0FBRXhCLFVBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0FBQ3RELFVBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDbkMsVUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7QUFDbkQsVUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7O0FBRW5DLFVBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUNsRCxVQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDOztBQUV6QyxVQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFO0FBQzNCLFlBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztPQUMzQyxNQUNJO0FBQ0gsWUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO09BQy9DO0FBQ0QsVUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7OztBQUdyQyxVQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDbkMsVUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQ3pDLFVBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQzs7O0FBRzdDLFVBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUc7QUFDbEIsc0JBQWMsRUFBRSxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO0FBQzVDLHFCQUFhLEVBQUUsQ0FBQztPQUNqQixDQUFDO0tBQ0gsQ0FBQyxDQUFDO0FBQ0gsV0FBTyxPQUFPLENBQUM7R0FDaEI7O0FBOUpHLFVBQVEsV0FnS1osaUJBQWlCLEdBQUEsNkJBQUc7QUFDbEIsV0FBTztBQUNMLFVBQUksRUFBRTtBQUNKLFlBQUksRUFBRSxTQUFTO0FBQ2YsaUJBQVMsRUFBRSxHQUFHO0FBQ2QsU0FBQyxFQUFFLEdBQUc7QUFDTixZQUFJLEVBQUUsRUFBRTtPQUNUO0FBQ0QsU0FBRyxFQUFFO0FBQ0gsWUFBSSxFQUFFLFVBQVU7QUFDaEIsaUJBQVMsRUFBRSxHQUFHO0FBQ2QsU0FBQyxFQUFFLEdBQUc7QUFDTixZQUFJLEVBQUUsRUFBRTtPQUNUO0FBQ0QsVUFBSSxFQUFFO0FBQ0osWUFBSSxFQUFFLFVBQVU7QUFDaEIsaUJBQVMsRUFBRSxJQUFJO0FBQ2YsU0FBQyxFQUFFLEdBQUc7QUFDTixZQUFJLEVBQUUsRUFBRTtPQUNUO0tBQ0YsQ0FBQztHQUNIOztTQXJMRyxRQUFROzs7QUF3TGQsTUFBTSxDQUFDLE9BQU8sR0FBRyxRQUFRLENBQUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiY2xhc3MgQWNvdXN0aWMge1xuICBjb25zdHJ1Y3Rvcih1cmxPckF1ZGlvRWxlbWVudCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmZmdFNpemUgPSBvcHRpb25zLmZmdFNpemUgfHwgNTEyO1xuICAgIHRoaXMuZmlsdGVycyA9IG9wdGlvbnMuZmlsdGVycyB8fCB0aGlzLmdldERlZmF1bHRGaWx0ZXJzKCk7XG5cbiAgICB0aGlzLmF1ZGlvID0gdGhpcy5pbml0QXVkaW8odXJsT3JBdWRpb0VsZW1lbnQpO1xuICAgIHRoaXMuY3VycmVudFRpbWUgPSAwO1xuICAgIHRoaXMucGxheWluZyA9IGZhbHNlO1xuXG4gICAgdGhpcy5jb250ZXh0ID0gbmV3ICh3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQpKCk7XG4gICAgdGhpcy5zb3VyY2UgPSB0aGlzLmNvbnRleHQuY3JlYXRlTWVkaWFFbGVtZW50U291cmNlKHRoaXMuYXVkaW8pO1xuICAgIHRoaXMuYW5hbHlzZXIgPSB0aGlzLmNvbnRleHQuY3JlYXRlQW5hbHlzZXIoKTtcbiAgICB0aGlzLmFuYWx5c2VyLmZmdFNpemUgPSB0aGlzLmZmdFNpemU7XG4gICAgdGhpcy5zYW1wbGVzID0gdGhpcy5hbmFseXNlci5mcmVxdWVuY3lCaW5Db3VudDtcblxuICAgIC8vIGNyZWF0ZSBkZWxheSB0byBjb21wZW5zYXRlIGZmdFNpemUgbGFnXG4gICAgaWYgKHRoaXMuY29udGV4dC5jcmVhdGVEZWxheSkge1xuICAgICAgdGhpcy5kZWxheSA9IHRoaXMuY29udGV4dC5jcmVhdGVEZWxheSgpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRoaXMuZGVsYXkgPSB0aGlzLmNvbnRleHQuY3JlYXRlRGVsYXlOb2RlKCk7XG4gICAgfVxuICAgIHRoaXMuZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gdGhpcy5mZnRTaXplICogMiAvIHRoaXMuY29udGV4dC5zYW1wbGVSYXRlO1xuXG4gICAgLy8gQ3JlYXRlIGEgZGF0YSB2YXJpYWJsZSBmb3IgbWFpbiBhbmFseWVyIGFuZCBmaWx0ZXJzLlxuICAgIHRoaXMuZGF0YSA9IHtcbiAgICAgIHRpbWVEb21haW5EYXRhOiBuZXcgVWludDhBcnJheSh0aGlzLnNhbXBsZXMpLFxuICAgICAgdGltZURvbWFpblJNUzogMCxcbiAgICAgIGZpbHRlcnM6IHt9XG4gICAgfTtcblxuICAgIC8vIENvbm5lY3QgYXVkaW8gcHJvY2Vzc2luZyBub2Rlcy5cbiAgICB0aGlzLnNvdXJjZS5jb25uZWN0KHRoaXMuYW5hbHlzZXIpO1xuICAgIHRoaXMuYW5hbHlzZXIuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy5jb250ZXh0LmRlc3RpbmF0aW9uKTtcblxuICAgIC8vIENyZWF0ZSB3ZWJhdWRpbyBub2RlcyBmb3IgZmlsdGVycy5cbiAgICB0aGlzLmZpbHRlcnMgPSB0aGlzLmluaXRGaWx0ZXJzKHRoaXMuZmlsdGVycywgdGhpcy5kYXRhKTtcbiAgfVxuXG4gIGluaXRBdWRpbyh1cmxPckF1ZGlvRWxlbWVudCkge1xuICAgIGxldCBhdWRpbyA9IGZhbHNlO1xuICAgIGlmICh0eXBlb2YgdXJsT3JBdWRpb0VsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBhdWRpbyA9IG5ldyBBdWRpbyh1cmxPckF1ZGlvRWxlbWVudCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYXVkaW8gPSB1cmxPckF1ZGlvRWxlbWVudDtcbiAgICB9XG5cbiAgICBhdWRpby5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5vbkNhblBsYXkpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLm9uQ2FuUGxheSh0aGlzKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBhdWRpbztcbiAgfVxuXG4gIHVwZGF0ZSgpIHtcbiAgICBpZiAoIXRoaXMucGxheWluZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLmFuYWx5c2VyLnNtb290aGluZ1RpbWVDb25zdGFudCA9IGZhbHNlO1xuICAgIHRoaXMuYW5hbHlzZXIuZ2V0Qnl0ZVRpbWVEb21haW5EYXRhKHRoaXMuZGF0YS50aW1lRG9tYWluRGF0YSk7XG5cbiAgICB0aGlzLmRhdGEudGltZURvbWFpblJNUyA9IHRoaXMucm1zKHRoaXMuZGF0YS50aW1lRG9tYWluRGF0YSk7XG5cbiAgICBPYmplY3Qua2V5cyh0aGlzLmZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gaXRlcmF0ZUZpbHRlcnMoa2V5KSB7XG4gICAgICBsZXQgaXRlbSA9IHNlbGYuZmlsdGVyc1trZXldO1xuICAgICAgbGV0IGl0ZW1EYXRhID0gc2VsZi5kYXRhLmZpbHRlcnNba2V5XTtcbiAgICAgIGl0ZW0uYW5hbHlzZXJOb2RlLmZmdFNpemUgPSBzZWxmLmZmdFNpemU7XG4gICAgICBpdGVtLmFuYWx5c2VyTm9kZS5nZXRCeXRlVGltZURvbWFpbkRhdGEoaXRlbURhdGEudGltZURvbWFpbkRhdGEpO1xuICAgICAgLy8gU21vb3RoIGludGVuc2l0eS5cbiAgICAgIGl0ZW1EYXRhLnRpbWVEb21haW5STVMgKz0gKHNlbGYucm1zKGl0ZW1EYXRhLnRpbWVEb21haW5EYXRhKSAtIGl0ZW1EYXRhLnRpbWVEb21haW5STVMpICogMC40O1xuICAgIH0pO1xuICB9XG5cbiAgcm1zKGRhdGEpIHtcbiAgICBsZXQgc2l6ZSA9IGRhdGEubGVuZ3RoO1xuICAgIGxldCBhY2N1bXVsYXRpb24gPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2l6ZTsgaSsrKSB7XG4gICAgICAvL2xldCBpbnRlbnNpdHkgPSBkYXRhW2ldO1xuICAgICAgbGV0IGludGVuc2l0eSA9IE1hdGguYWJzKGRhdGFbaV0gLSAxMjgpO1xuICAgICAgYWNjdW11bGF0aW9uICs9IGludGVuc2l0eSAqIGludGVuc2l0eTtcbiAgICB9XG5cbiAgICByZXR1cm4gTWF0aC5zcXJ0KGFjY3VtdWxhdGlvbiAvIHNpemUpO1xuICB9XG5cbiAgcGxheSgpIHtcbiAgICBpZiAodGhpcy5hdWRpbykge1xuICAgICAgdGhpcy5wbGF5aW5nID0gdHJ1ZTtcbiAgICAgIHRoaXMuYXVkaW8ucGxheSgpO1xuICAgICAgdGhpcy5hdWRpby5jdXJyZW50VGltZSA9IHRoaXMuY3VycmVudFRpbWU7XG4gICAgfVxuICB9XG5cbiAgcGF1c2UoKSB7XG4gICAgaWYgKHRoaXMuYXVkaW8pIHtcbiAgICAgIHRoaXMucGxheWluZyA9IGZhbHNlO1xuICAgICAgdGhpcy5hdWRpby5wYXVzZSgpO1xuICAgIH1cbiAgfVxuXG4gIHNlZWsoc2Vjb25kcykge1xuICAgIHRoaXMuY3VycmVudFRpbWUgPSBzZWNvbmRzO1xuICAgIGlmICh0aGlzLmF1ZGlvICYmIHRoaXMuYXVkaW8ucGF1c2VkID09PSBmYWxzZSkge1xuICAgICAgdGhpcy5hdWRpby5jdXJyZW50VGltZSA9IHRoaXMuY3VycmVudFRpbWU7XG4gICAgfVxuICB9XG5cbiAgZ2V0VmFsdWUoZmlsdGVyTmFtZSkge1xuICAgIGxldCB2YWw7XG4gICAgaWYgKCFmaWx0ZXJOYW1lKSB7XG4gICAgICB2YWwgPSB0aGlzLmRhdGEudGltZURvbWFpblJNUztcbiAgICB9XG4gICAgZWxzZSBpZiAodGhpcy5kYXRhLmZpbHRlcnNbZmlsdGVyTmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgdmFsID0gdGhpcy5kYXRhLmZpbHRlcnNbZmlsdGVyTmFtZV0udGltZURvbWFpblJNUztcbiAgICB9XG4gICAgcmV0dXJuIHZhbDtcbiAgfVxuXG4gIGluaXRGaWx0ZXJzKGZpbHRlcnMsIGRhdGEpIHtcbiAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgT2JqZWN0LmtleXMoZmlsdGVycykuZm9yRWFjaChmdW5jdGlvbiBpdGVyYXRlRmlsdGVycyhrZXkpIHtcbiAgICAgIGxldCBpdGVtID0gZmlsdGVyc1trZXldO1xuICAgICAgLy8gQ3JlYXRlIHRoZSBsb3dwYXNzL2JhbmRwYXNzL2hpZ2hwYXNzIGZpbHRlcnMuXG4gICAgICBpdGVtLmJpcXVhZEZpbHRlciA9IHNlbGYuY29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcbiAgICAgIGl0ZW0uYmlxdWFkRmlsdGVyLnR5cGUgPSBpdGVtLnR5cGU7XG4gICAgICBpdGVtLmJpcXVhZEZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSBpdGVtLmZyZXF1ZW5jeTtcbiAgICAgIGl0ZW0uYmlxdWFkRmlsdGVyLlEudmFsdWUgPSBpdGVtLlE7XG5cbiAgICAgIGl0ZW0uYW5hbHlzZXJOb2RlID0gc2VsZi5jb250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG4gICAgICBpdGVtLmFuYWx5c2VyTm9kZS5mZnRTaXplID0gc2VsZi5mZnRTaXplO1xuXG4gICAgICBpZiAoc2VsZi5jb250ZXh0LmNyZWF0ZUdhaW4pIHtcbiAgICAgICAgaXRlbS5nYWluTm9kZSA9IHNlbGYuY29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgaXRlbS5nYWluTm9kZSA9IHNlbGYuY29udGV4dC5jcmVhdGVHYWluTm9kZSgpO1xuICAgICAgfVxuICAgICAgaXRlbS5nYWluTm9kZS5nYWluLnZhbHVlID0gaXRlbS5nYWluO1xuXG4gICAgICAvLyBDb25uZWN0IGZpbHRlcnMgYXVkaW8gcHJvY2Vzc2luZyBub2Rlcy5cbiAgICAgIHNlbGYuc291cmNlLmNvbm5lY3QoaXRlbS5nYWluTm9kZSk7XG4gICAgICBpdGVtLmdhaW5Ob2RlLmNvbm5lY3QoaXRlbS5iaXF1YWRGaWx0ZXIpO1xuICAgICAgaXRlbS5iaXF1YWRGaWx0ZXIuY29ubmVjdChpdGVtLmFuYWx5c2VyTm9kZSk7XG5cbiAgICAgIC8vIFByZXBhcmUgZGF0YS5cbiAgICAgIGRhdGEuZmlsdGVyc1trZXldID0ge1xuICAgICAgICB0aW1lRG9tYWluRGF0YTogbmV3IFVpbnQ4QXJyYXkoc2VsZi5zYW1wbGVzKSxcbiAgICAgICAgdGltZURvbWFpblJNUzogMFxuICAgICAgfTtcbiAgICB9KTtcbiAgICByZXR1cm4gZmlsdGVycztcbiAgfVxuXG4gIGdldERlZmF1bHRGaWx0ZXJzKCkge1xuICAgIHJldHVybiB7XG4gICAgICBiYXNzOiB7XG4gICAgICAgIHR5cGU6ICdsb3dwYXNzJyxcbiAgICAgICAgZnJlcXVlbmN5OiAxMjAsXG4gICAgICAgIFE6IDEuMixcbiAgICAgICAgZ2FpbjogMTJcbiAgICAgIH0sXG4gICAgICBtaWQ6IHtcbiAgICAgICAgdHlwZTogJ2JhbmRwYXNzJyxcbiAgICAgICAgZnJlcXVlbmN5OiA0MDAsXG4gICAgICAgIFE6IDEuMixcbiAgICAgICAgZ2FpbjogMTJcbiAgICAgIH0sXG4gICAgICBoaWdoOiB7XG4gICAgICAgIHR5cGU6ICdoaWdocGFzcycsXG4gICAgICAgIGZyZXF1ZW5jeTogMjAwMCxcbiAgICAgICAgUTogMS4yLFxuICAgICAgICBnYWluOiAxMlxuICAgICAgfVxuICAgIH07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBBY291c3RpYztcbiJdfQ==
