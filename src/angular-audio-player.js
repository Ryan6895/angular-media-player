/**
 * USEFUL LINKS:
 * Media events on <audio> and <video> tags:
 * https://developer.mozilla.org/en-US/docs/Web/Guide/DOM/Events/Media_events
 * Properties and Methods:
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement
 *
 * Understanding TimeRanges objects:
 * http://html5doctor.com/html5-audio-the-state-of-play/
 *
 * Wonderful documentation from MDN, really.
 */
angular.module('angular-audio-player', ['helperFunctions'])

.directive('audioPlayer', ['$rootScope', '$log', '$interpolate', '$timeout', 'throttle',
  function ($rootScope, $log, $interpolate, $timeout, throttle) {

    /**
     * @usage: new AudioPlayer(element, scope, [playlist], [options]);
     *
     * @param {jqLite/jQuery element} [element] [usually that would be the element the directive is attached to]
     * @param {angular Scope} [scope] [scope in which call $apply, it could even be $rootScope (untested!)]
     * @param {Array} [playlist] [an Array made of audioElements (refer to README.md)]
     */
    var AudioPlayer = function (element, scope, playlist, options) {
      if (!(this instanceof AudioPlayer)) { return new AudioPlayer(playlist, options); }

      playlist = playlist || [];

      this._element = element;
      this._audioTag = element[0];
      this._bindListeners(scope);
      this._playlist = playlist;

      this.playing = false;
      this.currentTrack = 0;
      this.tracks = playlist.length;
      // just exposing <audio> properties.
      this.volume = this._audioTag.volume;
      this.duration = this._audioTag.duration;
      this.formatDuration = '';
      this.currentTime = this._audioTag.currentTime;
      this.formatTime = '';
      this.loadPercent = 0;
      // Alias
      this.position = this.currentTime;
      /**
       * TODO:
       * buffered - from audioTag
       * seekable - from audioTag
       */
    };

    AudioPlayer.prototype = {
      load: function (autoplayNext) {
        this._audioTag.load();
        if (autoplayNext) {
          var self = this;
          self._element.bind('canplaythrough', function (evt) {
            self.play();
            self._element.unbind('canplaythrough');
          });
        }
      },
      play: function () {
        // readyState = HAVE_NOTHING (0) means there's nothing into the <audio> tag
        if (!this.currentTrack && this._audioTag.readyState) { this.currentTrack++; }
        this._audioTag.play();
      },
      playPause: function () {
        if (this.playing) {
          this.pause();
        } else {
          this.play();
        }
      },
      pause: function () {
        this._audioTag.pause();
      },
      next: function (autoplay) {
        var self = this;
        if (self.currentTrack && self.currentTrack < self.tracks) {
          var wasPlaying = autoplay || self.playing;
          self.pause();
          $timeout(function () {
            self._clearAudioList();
            self._addAudioList(self._playlist[self.currentTrack]);
            self.load(wasPlaying); // setup autoplay here.
            self.currentTrack++;
          });
        }
      },
      prev: function () {
        var self = this;
        if (self.currentTrack && self.currentTrack - 1) {
          var wasPlaying = self.playing;
          self.pause();
          $timeout(function () {
            self._clearAudioList();
            self._addAudioList(self._playlist[self.currentTrack - 2]);
            self.load(wasPlaying); // setup autoplay here.
            self.currentTrack--;
          });
        }
      },
      _addAudioList: function (audioList) {
        var self = this;
        if (angular.isArray(audioList)) {
          angular.forEach(audioList, function (singleElement, index) {
            var sourceElem = angular.element($interpolate('<source src="{{ src }}" type="{{ type }}" media="{{ media }}">')(singleElement));
            self._element.append(sourceElem);
          });
        } else if (angular.isObject(audioList)) {
          var sourceElem = angular.element($interpolate('<source src="{{ src }}" type="{{ type }}" media="{{ media }}">')(audioList));
          self._element.append(sourceElem);
        }
      },
      _clearAudioList: function () {
        this._element.contents().remove();
      },
      _formatTime: function (seconds) {
        var hours = parseInt(seconds / 3600, 10) % 24
          , minutes = parseInt(seconds / 60, 10) % 60
          , secs = parseInt(seconds % 60, 10)
          , result
          , fragment = (minutes < 10 ? "0" + minutes : minutes) + ":" + (secs  < 10 ? "0" + secs : secs);
        if (hours > 0) {
          result = (hours < 10 ? "0" + hours : hours) + ":" + fragment;
        } else {
          result = fragment;
        }
        return result;
      },
      _bindListeners: function (scope) {
        var self = this,
          element = this._element,
          updateTime = throttle(1000, false, function (evt) {
            $log.info('count how many times.');
            scope.$apply(function () {
              self.currentTime = self.position = self._audioTag.currentTime;
              self.formatTime = self._formatTime(self.currentTime);
            });
          }),
          updatePlaying = function (isPlaying) {
            return function (evt) {
              scope.$apply(function () {
                self.playing = isPlaying;
              });
            };
          },
          setDuration = function (evt) {
            scope.$apply(function () {
              if (!self.currentTrack) { self.currentTrack++; } // This is triggered *ONLY* the first time a <source> gets loaded.
              self.duration = self._audioTag.duration;
              self.formatDuration = self._formatTime(self.duration);
              self.loadPercent = parseInt((self._audioTag.buffered.end(self._audioTag.buffered.length - 1) / self.duration) * 100, 10);
            });
          },
          playNext = function (evt) {
            self.next(true);
          },
          updateProgress = function (evt) {
            if (self._audioTag.buffered.length) {
              scope.$apply(function () {
                self.loadPercent = parseInt((self._audioTag.buffered.end(self._audioTag.buffered.length - 1) / self.duration) * 100, 10);
              });
            }
          };

        element.bind('playing', updatePlaying(true));
        element.bind('pause', updatePlaying(false));
        element.bind('ended', playNext);
        element.bind('timeupdate', updateTime);
        element.bind('loadedmetadata', setDuration);
        element.bind('progress', updateProgress);
      }
    };

    return {
      scope: {
        exposedPlayer: '=playerControl',
        playlist: '=playlist'
      },
      link: function (scope, element, attrs, ctrl) {
        if (element[0].tagName !== 'AUDIO') {
          return $log.error('audioPlayer directive works only when attached to an <audio> type tag');
        }
        var audioElement = []
          , sourceElements = element.find('source')
          , playlist = scope.playlist || [];

        // Create a single playlist element from <source> tag(s).
        angular.forEach(sourceElements, function (sourceElement, index) {
          audioElement.push({ src: sourceElement.src, type: sourceElement.type, media: sourceElement.media });
        });
        // Put audioElement as first element in the playlist
        if (audioElement.length) { playlist.unshift(audioElement); }

        // New declaration style
        scope.exposedPlayer = new AudioPlayer(element, scope, playlist);


        scope.$watch('playlist', function (playlistNew, playlistOld, watchScope) {
          $log.warn('playlist changed');

          var player = scope.exposedPlayer
            , currentTrack
            , newTrackNum = null;
          
          /**
           * Playlist update logic:
           * If the player has started ->
           *   Check if the playing track is in the new Playlist [EXAMPLE BELOW]
           *   If it is ->
           *     Assign to it the new tracknumber
           *   Else ->
           *     Pause the player, and get the new Playlist
           *   
           * Else (if the player hasn't started yet)
           *   Just replace the <src> tags inside the <audio>
           * 
           * Example
           * playlist: [a,b,c], playing: c, trackNum: 2
           * ----delay 5 sec-----
           * playlist: [f,a,b,c], playing: c, trackNum: 3
           * 
           */
          if (player.currentTrack) {
            currentTrack = playlistOld[player.currentTrack - 1];
            for (var i = 0; i < playlistNew.length; i++) {
              if (angular.equals(playlistNew[i], currentTrack)) { newTrackNum = i; break; }
            }
            if (newTrackNum) { // currentTrack it's still in the new playlist, update trackNumber
              player.currentTrack = newTrackNum + 1;
              player.tracks = playlistNew.length;
            } else { // currentTrack has been removed.
              player.pause();
              if (playlistNew.length) { // if the new playlist has some elements, replace actual.
                $timeout(function () { // need $timeout because the audioTag needs a little time to launch the 'pause' event
                  player._clearAudioList();
                  player._addAudioList(playlistNew[0]);
                  player.load();
                  player.tracks = playlistNew.length;
                });
              }
            }
          } else if (playlistNew.length) {
            player._clearAudioList();
            player._addAudioList(playlistNew[0]);
            player.load();
            player.tracks = playlistNew.length;
          }

        }, true);

        scope.$on('$destroy', function () {
          // Cleanup code here! Remove EventListeners
        });
      }
    };
  }]
);
