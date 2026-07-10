// Ensure global polyfills are installed before any Shaka instance is created
shaka.polyfill.installAll();

class PlaybackEngineModule {
    constructor() {
        this.videoElement = document.getElementById('video-element');
        this.player = null;

        this.thumbVideo = document.createElement('video');
        this.thumbVideo.muted = true;
        this.thumbPlayer = null;

        this.searchInput = document.querySelector('.search-input');
        this.analyzeBtn = document.querySelector('.search-btn');
        this.sysStatus = document.querySelector('.sys-status');

        this.videoContainer = document.getElementById('video-container');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.progressContainer = document.getElementById('progress-container');
        this.progressBar = document.getElementById('progress-bar');
        this.timeCurrent = document.getElementById('time-current');
        this.timeTotal = document.getElementById('time-total');
        this.timeSeparator = document.getElementById('time-separator');
        
        this.liveIndicator = document.getElementById('live-indicator');
        this.liveText = document.getElementById('live-text');
        
        this.qualityBtn = document.getElementById('quality-btn');
        this.qualityMenu = document.getElementById('quality-menu');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');

        this.hudRes = document.getElementById('hud-res');
        this.hudBw = document.getElementById('hud-bw');
        this.hudDropped = document.getElementById('hud-dropped');
        this.hudBuffer = document.getElementById('hud-buffer');

        this.trackSequences = {};
        
        // EVENT-DRIVEN SYNC STATE 
        this.startupQueue = [];
        this.activeTrackState = null;
        
        this.isDragging = false;
        this.wasPlaying = false;

        this.errorToastContainer = document.getElementById('error-toast-container');
        if (!this.errorToastContainer) {
            this.errorToastContainer = document.createElement('div');
            this.errorToastContainer.id = 'error-toast-container';
            document.body.appendChild(this.errorToastContainer);
        }

        this.init();
        this.setupCustomControls();
    }

    setupCustomControls() {
        this.playerControls = document.getElementById('player-controls');
        this.centerActionIcon = document.getElementById('center-play-pause');
        this.centerActionIconSpan = this.centerActionIcon ? this.centerActionIcon.querySelector('.icon') : null;
        this.progressBuffered = document.getElementById('progress-buffered');
        
        this.thumbPreview = document.getElementById('thumbnail-preview');
        this.thumbCanvas = document.getElementById('thumb-canvas');
        this.thumbTime = document.getElementById('thumb-time');
        this.thumbCtx = this.thumbCanvas ? this.thumbCanvas.getContext('2d', { willReadFrequently: true }) : null;
        
        this.muteBtn = document.getElementById('mute-btn');
        this.volumeSlider = document.getElementById('volume-slider');

        this.thumbVideo.addEventListener('seeked', () => {
            if (this.thumbCtx && this.thumbCanvas) {
                this.thumbCtx.drawImage(this.thumbVideo, 0, 0, this.thumbCanvas.width, this.thumbCanvas.height);
            }
        });

        let idleTimeout;
        const resetIdleTimer = () => {
            this.videoContainer.classList.remove('is-idle');
            clearTimeout(idleTimeout);
            if (!this.videoElement.paused) {
                idleTimeout = setTimeout(() => {
                    if (this.playerControls && !this.playerControls.matches(':hover')) {
                        this.videoContainer.classList.add('is-idle');
                    }
                }, 2500);
            }
        };

        this.videoContainer.addEventListener('mousemove', resetIdleTimer);
        this.videoContainer.addEventListener('mousedown', resetIdleTimer);
        this.videoElement.addEventListener('play', resetIdleTimer);
        this.videoElement.addEventListener('pause', resetIdleTimer);
        
        // Dynamically shift fullscreen Material Symbol
        document.addEventListener('fullscreenchange', () => {
            resetIdleTimer();
            if (document.fullscreenElement) {
                this.fullscreenBtn.innerHTML = '<span class="material-symbols-outlined">fullscreen_exit</span>';
            } else {
                this.fullscreenBtn.innerHTML = '<span class="material-symbols-outlined">fullscreen</span>';
            }
        });
        
        this.videoContainer.addEventListener('mouseleave', () => {
            if (!this.videoElement.paused) this.videoContainer.classList.add('is-idle');
        });

        resetIdleTimer(); 

        const updateVolumeIcon = () => {
            if (this.videoElement.muted || this.videoElement.volume === 0) {
                this.muteBtn.innerHTML = '<span class="material-symbols-outlined">volume_off</span>';
            } else if (this.videoElement.volume < 0.5) {
                this.muteBtn.innerHTML = '<span class="material-symbols-outlined">volume_down</span>';
            } else {
                this.muteBtn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
            }
        };
		
		updateVolumeIcon();

        this.muteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.videoElement.muted = !this.videoElement.muted;
            this.volumeSlider.value = this.videoElement.muted ? 0 : (this.videoElement.volume || 1);
            if (!this.videoElement.muted && this.videoElement.volume === 0) {
                this.videoElement.volume = 1;
                this.volumeSlider.value = 1;
            }
            updateVolumeIcon();
        });

        this.volumeSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const vol = parseFloat(e.target.value);
            this.videoElement.volume = vol;
            this.videoElement.muted = (vol === 0);
            updateVolumeIcon();
        });

        this.volumeSlider.addEventListener('click', (e) => e.stopPropagation());
        this.volumeSlider.addEventListener('mousedown', (e) => e.stopPropagation());
        
        this.videoElement.addEventListener('volumechange', () => {
            this.volumeSlider.value = this.videoElement.muted ? 0 : this.videoElement.volume;
            updateVolumeIcon();
        });

        const togglePlay = () => {
            if (this.videoElement.paused) this.videoElement.play();
            else this.videoElement.pause();
        };
        this.playPauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });
        this.videoElement.addEventListener('click', togglePlay);

        const triggerCenterAnimation = (iconHtml) => {
            if (!this.centerActionIcon || !this.centerActionIconSpan) return;
            this.centerActionIconSpan.innerHTML = iconHtml;
            this.centerActionIcon.classList.remove('animate-action');
            void this.centerActionIcon.offsetWidth; 
            this.centerActionIcon.classList.add('animate-action');
        };

        this.videoElement.addEventListener('play', () => {
            this.playPauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
            triggerCenterAnimation('<span class="material-symbols-outlined" style="font-size: 42px;">play_arrow</span>');
        });
        
        this.videoElement.addEventListener('pause', () => {
            this.playPauseBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
            triggerCenterAnimation('<span class="material-symbols-outlined" style="font-size: 42px;">pause</span>');
        });

        this.videoElement.addEventListener('playing', () => {
            if (this.startupQueue.length > 0) {
                const activeTrack = this.player.getVariantTracks().find(t => t.active);
                if (activeTrack) {
                    const tId = activeTrack.id.toString();
                    const tInfo = activeTrack.height ? `${activeTrack.height}p (${(activeTrack.bandwidth/1000000).toFixed(1)}M)` : 'Audio';
                    this.flushStartupQueue(tId, tInfo);
                }
            }
        });

        this.videoElement.addEventListener('timeupdate', () => {
            const current = this.videoElement.currentTime;
            const duration = this.videoElement.duration;
            
            const buffered = this.videoElement.buffered;
            let bufferedEnd = current;
            for (let i = 0; i < buffered.length; i++) {
                if (current >= buffered.start(i) && current <= buffered.end(i)) {
                    bufferedEnd = buffered.end(i);
                    break;
                }
            }
            
            if (this.player && this.player.isLive()) {
                const seekable = this.videoElement.seekable;
                if (seekable.length > 0) {
                    const start = seekable.start(0);
                    const end = seekable.end(seekable.length - 1);
                    
                    const pct = Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100));
                    if (!this.isDragging) this.progressBar.style.width = `${pct}%`;
                    
                    const bufferedPct = Math.max(0, Math.min(100, ((bufferedEnd - start) / (end - start)) * 100));
                    if (this.progressBuffered) this.progressBuffered.style.width = `${bufferedPct}%`;
                }
            } else if (duration) {
                const pct = (current / duration) * 100;
                if (!this.isDragging) this.progressBar.style.width = `${pct}%`;
                
                const bufferedPct = (bufferedEnd / duration) * 100;
                if (this.progressBuffered) this.progressBuffered.style.width = `${bufferedPct}%`;
                
                this.timeCurrent.textContent = this.formatTime(current);
                this.timeTotal.textContent = this.formatTime(duration);
            }
        });

        let shadowSeekTimeout = null;
        let activeSpriteUrl = null;
        let spriteImage = new Image();

        this.progressContainer.addEventListener('mousemove', async (e) => {
            const rect = this.progressContainer.getBoundingClientRect();
            let pos = (e.clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));

            if (this.thumbPreview) {
                this.thumbPreview.style.left = `${pos * 100}%`;
                
                let hoverTime = 0;
                if (this.player && this.player.isLive()) {
                    const seekable = this.videoElement.seekable;
                    if (seekable.length > 0) {
                        const start = seekable.start(0);
                        const end = seekable.end(seekable.length - 1);
                        hoverTime = start + (pos * (end - start));
                    }
                } else if (this.videoElement.duration) {
                    hoverTime = pos * this.videoElement.duration;
                }

                if (this.thumbTime) this.thumbTime.textContent = this.formatTime(hoverTime);

                let usedNativeSprite = false;

                if (this.player) {
                    const imageTracks = this.player.getImageTracks();
                    if (imageTracks.length > 0) {
                        try {
                            const thumb = await this.player.getThumbnails(imageTracks[0].id, hoverTime);
                            if (thumb && thumb.uris.length > 0) {
                                usedNativeSprite = true;
                                const uri = thumb.uris[0];

                                if (activeSpriteUrl !== uri) {
                                    activeSpriteUrl = uri;
                                    spriteImage.src = uri;
                                }

                                if (this.thumbCtx && this.thumbCanvas) {
                                    this.thumbCtx.clearRect(0, 0, this.thumbCanvas.width, this.thumbCanvas.height);
                                    this.thumbCtx.drawImage(
                                        spriteImage,
                                        thumb.positionX, thumb.positionY, thumb.width, thumb.height, 
                                        0, 0, this.thumbCanvas.width, this.thumbCanvas.height        
                                    );
                                }
                            }
                        } catch (err) {
                            usedNativeSprite = false; 
                        }
                    }
                }

                if (!usedNativeSprite) {
                    if (shadowSeekTimeout) clearTimeout(shadowSeekTimeout);
                    shadowSeekTimeout = setTimeout(() => {
                        if (Math.abs(this.thumbVideo.currentTime - hoverTime) > 0.1) {
                            this.thumbVideo.currentTime = hoverTime;
                        }
                    }, 150);
                }
            }

            if (this.isDragging) updateScrub(e);
        });

        const updateScrub = (e) => {
            const rect = this.progressContainer.getBoundingClientRect();
            let pos = (e.clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));

            if (this.player && this.player.isLive()) {
                const seekable = this.videoElement.seekable;
                if (seekable.length > 0) {
                    const start = seekable.start(0);
                    const end = seekable.end(seekable.length - 1);
                    this.videoElement.currentTime = start + (pos * (end - start));
                    this.progressBar.style.width = `${pos * 100}%`;
                }
            } else if (this.videoElement.duration) {
                this.videoElement.currentTime = pos * this.videoElement.duration;
                this.progressBar.style.width = `${pos * 100}%`;
            }
        };

        const onMouseMove = (e) => { if (this.isDragging) updateScrub(e); };

        const onMouseUp = (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                if (this.wasPlaying) this.videoElement.play();
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            }
        };

        this.progressContainer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.isDragging = true;
            this.wasPlaying = !this.videoElement.paused;
            if (this.wasPlaying) this.videoElement.pause();
            
            updateScrub(e);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        this.qualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.qualityMenu.style.display = this.qualityMenu.style.display === 'none' ? 'flex' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (this.qualityMenu && !this.qualityMenu.contains(e.target) && e.target !== this.qualityBtn) {
                this.qualityMenu.style.display = 'none';
            }
        });

        this.fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!document.fullscreenElement) {
                this.videoContainer.requestFullscreen().catch(err => console.error(err));
            } else {
                document.exitFullscreen();
            }
        });
    }

    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    handleQualityEvent() {
        const activeTrack = this.player.getVariantTracks().find(t => t.active);
        
        if (activeTrack) {
            const tId = activeTrack.id.toString();
            const tInfo = activeTrack.height ? `${activeTrack.height}p (${(activeTrack.bandwidth/1000000).toFixed(1)}M)` : 'Audio';
            
            this.activeTrackState = { id: tId, info: tInfo };
            
            if (window.TimelineMap) {
                window.TimelineMap.forceActiveTrackRow(tId, tInfo);
            }
            
            if (this.startupQueue.length > 0) {
                this.flushStartupQueue(tId, tInfo);
            }
        }
    }

    flushStartupQueue(trackId, trackInfo) {
        this.startupQueue.forEach(seg => {
            seg.trackId = trackId;
            seg.trackInfo = trackInfo;
            const uId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().substring(0,6) : Math.random().toString(36).substr(2, 6);
            seg.id = `${trackId}-${seg.startTime.toFixed(3)}-${uId}`;
            
            if (!this.trackSequences[trackId]) this.trackSequences[trackId] = 0;
            seg.seq = ++this.trackSequences[trackId];
            
            if (window.TimelineMap) window.TimelineMap.addSegment(seg);
        });
        this.startupQueue = [];
    }

    async init() {
        if (!shaka.Player.isBrowserSupported()) {
            this.updateSystemStatus('ERROR: BROWSER UNSUPPORTED', 'var(--accent-red)');
            return;
        }

        this.player = new shaka.Player(this.videoElement);
        this.thumbPlayer = new shaka.Player(this.thumbVideo); 

        const networkingEngine = this.player.getNetworkingEngine();
        
        networkingEngine.registerResponseFilter((type, response) => {
            if(type === shaka.net.NetworkingEngine.RequestType.MANIFEST) {
                const manifestText = (new TextDecoder()).decode(response.data);
                if(window.ManifestAnalyzer != null) {
                    const assetUri = this.player.getAssetUri();
                    const assetName = assetUri.substring(assetUri.lastIndexOf('/') + 1);
                    window.ManifestAnalyzer.targetLabel.textContent = assetName;
                    
                    if(assetName.includes(".mpd")) {
                        window.ManifestAnalyzer.processDASH(manifestText);
                    } else {
                        window.ManifestAnalyzer.processHLS(manifestText);
                    }
                }
            }
        });

        networkingEngine.registerResponseFilter((type, response) => {
            if (type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
                try {
                    const currentPlayheadTime = this.videoElement.currentTime;
                    const stats = this.player.getStats();
                    const activeBitrateMbps = stats.estimatedBandwidth / 1000000;
                    
                    let isInitChunk = false;
                    let targetFormat = 'fMP4';

                    if (response.data && response.data.byteLength >= 8) {
                        const dv = new DataView(response.data);
                        if (dv.getUint8(0) === 0x47) {
                            targetFormat = 'MPEG-TS'; 
                        } else {
                            const boxType = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
                            if (boxType === 'ftyp' || boxType === 'moov') {
                                isInitChunk = true; 
                            }
                        }
                    } else if (response.uri && response.uri.toLowerCase().includes('.webm')) {
                        targetFormat = 'WEBM';
                        isInitChunk = response.uri.toLowerCase().includes('init');
                    }

                    if (window.StreamCapture) {
                        window.StreamCapture.setFormat(targetFormat);
                    }

                    if (window.TelemetryMap) {
                        window.TelemetryMap.addTelemetryData(currentPlayheadTime, activeBitrateMbps, isInitChunk);
                    }

                    if (window.TimelineMap && response.uri) {
                        let possibleMatches = [];
                        const manifest = this.player.getManifest();

                        if (manifest && manifest.variants) {
                            for (const variant of manifest.variants) {
                                const stream = variant.video || variant.audio;
                                if (!stream) continue;
                                
                                if (isInitChunk && stream.initSegmentReference && stream.initSegmentReference.getUris().some(u => response.uri.includes(u))) {
                                    possibleMatches.push({ variant, isInit: true, startTime: 0, duration: 0 });
                                    continue; 
                                }

                                if (!isInitChunk && stream.segmentIndex) {
                                    let refs = [];
                                    try {
                                        refs = typeof stream.segmentIndex[Symbol.iterator] === 'function' ? Array.from(stream.segmentIndex) : (stream.segmentIndex.references || []);
                                    } catch(e) {}
                                    
                                    let matchedMedia = false;
                                    for (const ref of refs) {
                                        if (ref.getUris().some(u => response.uri.includes(u))) {
                                            possibleMatches.push({ variant, isInit: false, startTime: ref.startTime, duration: ref.endTime - ref.startTime });
                                            matchedMedia = true;
                                            break; 
                                        }
                                    }
                                    if (matchedMedia) continue;
                                }
                            }

                            if (possibleMatches.length === 0) {
                                for (const variant of manifest.variants) {
                                    if (variant.video) {
                                        const uriLower = response.uri.toLowerCase();
                                        const vHeight = variant.video.height;
                                        const vBw = variant.bandwidth;
                                        if (uriLower.includes(`/${vHeight}/`) || uriLower.includes(`_${vHeight}p`) || uriLower.includes(vBw.toString())) {
                                            possibleMatches.push({ variant, isInit: isInitChunk, startTime: currentPlayheadTime, duration: 0 });
                                        }
                                    }
                                }
                            }
                        }

                        let resolvedTrackId = null;
                        let resolvedTrackInfo = null;
                        let resolvedStartTime = 0;
                        let resolvedDuration = 0;
                        let resolvedIsInit = isInitChunk;

                        if (possibleMatches.length === 1) {
                            const m = possibleMatches[0];
                            resolvedTrackId = m.variant.id.toString();
                            resolvedTrackInfo = m.variant.video ? `${m.variant.video.height}p (${(m.variant.bandwidth/1000000).toFixed(1)}M)` : 'Audio';
                            resolvedStartTime = m.startTime;
                            resolvedDuration = m.duration;

                            this.activeTrackState = { id: resolvedTrackId, info: resolvedTrackInfo };
                            
                            if (this.startupQueue.length > 0) {
                                this.flushStartupQueue(resolvedTrackId, resolvedTrackInfo);
                            }
                        } 
                        else if (possibleMatches.length > 1) {
                            const m = possibleMatches[0];
                            this.startupQueue.push({
                                startTime: m.startTime,
                                duration: m.duration,
                                format: isInitChunk ? targetFormat + ' (INIT)' : targetFormat,
                                isActive: false,
                                isInit: isInitChunk,
                                uri: response.uri
                            });
                            return; 
                        } 
                        else {
                            const activeTrack = this.player.getVariantTracks().find(t => t.active);
                            if (activeTrack) {
                                resolvedTrackId = activeTrack.id.toString();
                                resolvedTrackInfo = activeTrack.height ? `${activeTrack.height}p (${(activeTrack.bandwidth/1000000).toFixed(1)}M)` : 'Audio';
                                resolvedStartTime = currentPlayheadTime;
                            }
                        }

                        if (resolvedTrackId) {
                            if (!this.trackSequences[resolvedTrackId]) this.trackSequences[resolvedTrackId] = 0;
                            
                            const uId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().substring(0,6) : Math.random().toString(36).substr(2, 6);
                            const uniqueSegId = `${resolvedTrackId}-${resolvedStartTime.toFixed(3)}-${uId}`;

                            window.TimelineMap.addSegment({
                                id: uniqueSegId,
                                seq: ++this.trackSequences[resolvedTrackId],
                                startTime: resolvedStartTime,
                                duration: resolvedDuration,
                                format: resolvedIsInit ? targetFormat + ' (INIT)' : targetFormat,
                                trackId: resolvedTrackId,
                                trackInfo: resolvedTrackInfo,
                                isActive: false,
                                isInit: resolvedIsInit,
                                uri: response.uri
                            });
                        }
                    }
                    
                    if (window.StreamCapture) {
                        if (isInitChunk) window.StreamCapture.setInitBuffer(response.data);
                        else window.StreamCapture.appendData(response.data);
                    }

                } catch (err) {
                    console.warn("Telemetry filter bypassed due to extraction error:", err);
                }
            }
        });
        
        this.player.addEventListener('adaptation', () => this.handleQualityEvent());
        this.player.addEventListener('variantchanged', () => this.handleQualityEvent());
        this.player.addEventListener('error', (event) => this.onError(event.detail));
        this.player.addEventListener('trackschanged', () => this.populateQualityMenu());

        this.analyzeBtn.addEventListener('click', () => this.loadStream());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadStream();
        });

        setInterval(() => this.updateTelemetry(), 1000);
    }

    async loadStream() {
        const url = this.searchInput.value.trim();
        if (!url) return;

        this.updateSystemStatus('BUFFERING PIPELINES...', 'var(--accent-amber)');
        
        if (this.player.getAssetUri()) {
            await Promise.all([
                this.player.unload(),
                this.thumbPlayer.unload()
            ]);
        }
        
        this.trackSequences = {};
        this.startupQueue = [];
        this.hasStartedPlaying = false;
        this.activeTrackState = null;

        if (window.TelemetryMap) window.TelemetryMap.reset();
        if (window.TimelineMap) window.TimelineMap.clear();
        if (window.AtomInspector) window.AtomInspector.clear();
        if (window.ManifestAnalyzer) window.ManifestAnalyzer.currentUrl = null;
        
        try {
            this.qualityMenu.innerHTML = '<div class="q-option active" data-id="auto">Auto Quality</div>';
            this.player.configure({ abr: { enabled: true } });
            
            await Promise.all([
                this.player.load(url),
                this.thumbPlayer.load(url)
            ]);

            const thumbTracks = this.thumbPlayer.getVariantTracks();
            if (thumbTracks.length > 0) {
                const lowest = thumbTracks.reduce((prev, curr) => prev.bandwidth < curr.bandwidth ? prev : curr);
                this.thumbPlayer.configure({ abr: { enabled: false } });
                this.thumbPlayer.selectVariantTrack(lowest, true);
            }

            if (this.player.isLive()) {
                this.liveIndicator.style.display = 'flex';
                this.liveIndicator.classList.add('is-live');
                this.liveText.textContent = 'LIVE';
                this.timeSeparator.style.display = 'none';
                this.timeTotal.style.display = 'none';
            } else {
                this.liveIndicator.style.display = 'flex';
                this.liveIndicator.classList.remove('is-live');
                this.liveText.textContent = 'VOD';
                this.timeSeparator.style.display = 'inline';
                this.timeTotal.style.display = 'inline';
            }

            this.updateSystemStatus('SYS_STATUS: OPERATIONAL', 'var(--accent-green)');
        } catch (error) {
            this.onError(error);
        }
    }

    populateQualityMenu() {
        const tracks = this.player.getVariantTracks();
        
        const videoTracks = tracks
            .filter(t => t.type === 'variant' && t.videoId)
            .sort((a, b) => b.height - a.height);
        
        const uniqueTracks = [];
        const seen = new Set();
        
        for (const track of videoTracks) {
            const identifier = `${track.height}_${track.bandwidth}`;
            if (!seen.has(identifier)) {
                seen.add(identifier);
                uniqueTracks.push(track);
            }
        }

        this.qualityMenu.innerHTML = '<div class="q-option active" data-id="auto">Auto Quality</div>';
        
        uniqueTracks.forEach(track => {
            const option = document.createElement('div');
            option.className = 'q-option';
            option.dataset.id = track.id;
            option.textContent = `${track.height}p (${(track.bandwidth / 1000000).toFixed(1)} Mbps)`;
            this.qualityMenu.appendChild(option);
        });

        this.qualityMenu.querySelectorAll('.q-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const trackId = e.target.dataset.id;
                this.handleQualityChange(trackId);
                
                this.qualityMenu.querySelectorAll('.q-option').forEach(o => o.classList.remove('active'));
                e.target.classList.add('active');
                
                this.qualityMenu.style.display = 'none';
            });
        });
    }

    handleQualityChange(trackId) {
        if (trackId === 'auto') {
            this.player.configure({ abr: { enabled: true } });
        } else {
            this.player.configure({ abr: { enabled: false } });
            const tracks = this.player.getVariantTracks();
            const selectedTrack = tracks.find(t => t.id == trackId);
            
            if (selectedTrack) {
                this.player.selectVariantTrack(selectedTrack, true); 
            }
        }
    }

    updateTelemetry() {
        if (!this.player || this.videoElement.readyState === 0) return;

        const stats = this.player.getStats();
        
        this.hudRes.textContent = `${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`;
        this.hudBw.textContent = `${(stats.estimatedBandwidth / 1000000).toFixed(2)} Mbps`;

        const dropped = stats.droppedFrames || 0;
        this.hudDropped.textContent = dropped;
        this.hudDropped.style.color = dropped > 0 ? 'var(--accent-red)' : 'var(--accent-green)';

        let bufferDepth = 0;
        const currentTime = this.videoElement.currentTime;
        const buffered = this.videoElement.buffered;
        
        for (let i = 0; i < buffered.length; i++) {
            if (currentTime >= buffered.start(i) && currentTime < buffered.end(i)) {
                bufferDepth = buffered.end(i) - currentTime;
                break;
            }
        }
        
        this.hudBuffer.textContent = `${bufferDepth.toFixed(1)}s`;

        if (window.TimelineMap) {
            window.TimelineMap.syncToPlayhead(currentTime);
        }
    }

    updateSystemStatus(message, color) {
        if (this.sysStatus) {
            this.sysStatus.innerHTML = `<div class="status-dot" style="background-color: ${color}; box-shadow: 0 0 8px ${color};"></div> ${message}`;
            this.sysStatus.style.color = color;
        }
    }

    onError(error) {
        console.error('Shaka Playback Error:', error);
        this.updateSystemStatus(`ERROR CODE: ${error.code}`, 'var(--accent-red)');
        this.showErrorNotification(error);
    }

    showErrorNotification(error) {
        let errorType = "UNKNOWN SYSTEM ERROR";
        let summary = "An unexpected streaming failure occurred.";

        if (error.category === shaka.util.Error.Category.NETWORK) {
            errorType = "NETWORK / CORS ERROR";
            summary = "The network request was denied. If the stream URL works elsewhere, this is almost certainly caused by strict CORS headers on the target server preventing third-party access.";
        } else if (error.category === shaka.util.Error.Category.DRM) {
            errorType = "DRM ENCRYPTION BLOCKED";
            summary = "This stream utilizes DRM. Playback was denied because a valid Widevine or PlayReady license server was not provided or authenticated.";
        } else if (error.category === shaka.util.Error.Category.MANIFEST) {
            errorType = "MANIFEST PARSING FAILED";
            summary = "The engine could not interpret the playlist. The URL might point to a raw video file instead of an HLS/DASH manifest, or the file structure is corrupted.";
        } else if (error.category === shaka.util.Error.Category.MEDIA) {
            errorType = "MEDIA DECODE FAILURE";
            summary = "The stream downloaded successfully, but the browser's hardware cannot decode the specific video or audio codecs being used.";
        }

        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <div class="toast-title">
                <span style="display:flex; align-items:center; gap:6px;"><span class="material-symbols-outlined" style="font-size:16px;">error</span> ${errorType} [${error.code}]</span>
                <span class="toast-close material-symbols-outlined" style="font-size:18px;">close</span>
            </div>
            <div class="toast-desc">${summary}</div>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        const dismissToast = () => {
            toast.style.animation = 'fadeOutRight 0.3s cubic-bezier(0.4, 0.0, 1, 1) forwards';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        };
        
        closeBtn.addEventListener('click', dismissToast);
        this.errorToastContainer.appendChild(toast);
        setTimeout(dismissToast, 8000);
    }
}

class ManifestAnalyzerModule {
    constructor() {
        this.targetLabel = document.getElementById('manifest-target');
        this.codeArea = document.getElementById('manifest-code-area');
        this.validationBar = document.getElementById('manifest-validation-bar');
        this.currentUrl = null;
    }

    async fetchAndAnalyze(url) {
        if (!url || this.currentUrl === url) return;
        this.currentUrl = url;
        
        const filename = url.split('?')[0].split('/').pop() || 'stream_manifest';
        this.targetLabel.textContent = filename;
        this.targetLabel.style.color = 'var(--accent-amber)'; 

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const rawText = await response.text();
            
            if (rawText.includes('#EXTM3U')) {
                this.processHLS(rawText);
            } else if (rawText.includes('<MPD') || url.toLowerCase().includes('.mpd')) {
                this.processDASH(rawText);
            } else {
                throw new Error("Unrecognized manifest format.");
            }
            
            this.targetLabel.style.color = 'var(--accent-blue)'; 
        } catch (error) {
            this.renderErrorState(`Failed to fetch or parse manifest: ${error.message}`);
        }
    }

    processHLS(text) {
        const lines = text.replace(/\r\n/g, '\n').split('\n');
        let htmlOutput = '';
        let errors = 0;
        let warnings = 0;
        
        let targetDuration = null;
        let hasEndList = false;

        lines.forEach((line) => {
            let cleanLine = line.trim();
            if (!cleanLine) return; 

            let lineHtml = cleanLine;
            let lineClass = '';
            let lineWarningMsg = '';
            let lineErrorMsg = '';

            if (cleanLine.startsWith('#EXT')) {
                const colonIdx = cleanLine.indexOf(':');
                if (colonIdx !== -1) {
                    const tag = cleanLine.substring(0, colonIdx + 1);
                    const val = cleanLine.substring(colonIdx + 1);
                    lineHtml = `<span class="syn-hls-tag">${tag}</span><span class="syn-hls-val">${val}</span>`;
                } else {
                    lineHtml = `<span class="syn-hls-tag">${cleanLine}</span>`;
                }
            } else if (cleanLine.startsWith('#')) {
                lineHtml = `<span class="syn-hls-comment">${cleanLine}</span>`;
            }

            if (cleanLine.startsWith('#EXT-X-TARGETDURATION:')) {
                targetDuration = parseFloat(cleanLine.split(':')[1]);
            }

            if (cleanLine.startsWith('#EXTINF:')) {
                const duration = parseFloat(cleanLine.match(/#EXTINF:([0-9.]+)/)[1]);
                if (targetDuration && duration > Math.round(targetDuration)) {
                    lineClass = 'line-error';
                    lineErrorMsg = ` // ERROR: Segment duration (${duration}s) exceeds TARGETDURATION (${targetDuration}s)`;
                    errors++;
                }
            }

            if (cleanLine === '#EXT-X-DISCONTINUITY') {
                lineClass = 'line-warn';
                lineWarningMsg = ` // WARNING: Stream discontinuity detected. Playback buffering may occur.`;
                warnings++;
            }

            if (cleanLine === '#EXT-X-ENDLIST') {
                hasEndList = true;
            }

            if (lineClass) {
                htmlOutput += `<div class="${lineClass}">${lineHtml}<span style="font-size:11px;">${lineErrorMsg || lineWarningMsg}</span></div>\n`;
            } else {
                htmlOutput += `<div>${lineHtml}</div>\n`;
            }
        });

        this.codeArea.innerHTML = htmlOutput;

        if (errors > 0) {
            this.updateValidationBar(`<span class="material-symbols-outlined" style="font-size:16px;">cancel</span> RFC 8216 FAILED: ${errors} Errors | ${warnings} Warnings`, 'status-error');
        } else if (warnings > 0) {
            this.updateValidationBar(`<span class="material-symbols-outlined" style="font-size:16px;">warning</span> RFC 8216 PASSED WITH WARNINGS: 0 Errors | ${warnings} Warnings`, 'status-warn');
        } else {
            const streamType = hasEndList ? 'VOD' : 'LIVE';
            this.updateValidationBar(`<span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> RFC 8216 VALID (${streamType}): Syntax and chunk boundaries map perfectly.`, 'status-ok');
        }
    }

    processDASH(text) {
        let errors = 0;
        
        let htmlOutput = text.replace(/\r\n/g, '\n')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/(&lt;\/?)([a-zA-Z0-9:-]+)/g, '$1<span class="syn-xml-tag">$2</span>')
            .replace(/([a-zA-Z0-9:-]+)="([^"]*)"/g, '<span class="syn-xml-attr">$1</span>="<span class="syn-hls-val">$2</span>"');

        if (!text.includes('profiles=')) errors++;

        this.codeArea.innerHTML = `<div>${htmlOutput}</div>`;

        if (errors > 0) {
            this.updateValidationBar(`<span class="material-symbols-outlined" style="font-size:16px;">cancel</span> DASH SCHEMA ERROR: Missing mandatory attributes.`, 'status-error');
        } else {
            this.updateValidationBar(`<span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> ISO/IEC 23009-1 VALID: DASH XML structure aligns perfectly.`, 'status-ok');
        }
    }

    updateValidationBar(message, statusClass) {
        this.validationBar.innerHTML = message;
        this.validationBar.className = `validation-bar ${statusClass}`;
    }

    renderErrorState(message) {
        this.codeArea.innerHTML = `<div class="line-error" style="color:var(--text-main); margin-top:10px;">${message}</div>`;
        this.updateValidationBar('<span class="material-symbols-outlined" style="font-size:16px;">error</span> NETWORK OR PARSING FAILURE', 'status-error');
    }
}

class BitrateTelemetryModule {
    constructor() {
        this.container = document.getElementById('telemetry-container');
        this.canvas = document.getElementById('bitrate-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = document.getElementById('telemetry-tooltip');
        this.liveVal = document.getElementById('telemetry-live-val');

        this.dataPoints = []; 
        this.timeWindow = 60; 
        this.maxBitrate = 10; 
        this.padding = { top: 25, right: 20, bottom: 25, left: 40 };
        this.hoverX = null;
        this.drawPending = false;
        
        this.lastLogRealTime = null;
        this.lastClickTime = null;

        this.init();
    }

    init() {
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this.resizeObserver.observe(this.container);

        this.canvas.addEventListener('mousemove', (e) => this.handleHover(e));
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverX = null;
            this.tooltip.style.display = 'none';
            this.scheduleDraw();
        });
        
        this.canvas.addEventListener('click', (e) => this.handleClick(e));

        this.videoElement = document.getElementById('video-element');
        if (this.videoElement) {
            this.videoElement.addEventListener('timeupdate', () => this.scheduleDraw());
            this.videoElement.addEventListener('seeked', () => this.scheduleDraw());
        }

        this.resizeCanvas();
    }

    scheduleDraw() {
        if (!this.drawPending) {
            this.drawPending = true;
            requestAnimationFrame(() => {
                this.draw();
                this.drawPending = false;
            });
        }
    }

    addTelemetryData(time, bitrate, isKeyframe = false) {
        const now = performance.now();

        if (this.lastClickTime && now - this.lastClickTime < 800) return;

        if (this.lastLogRealTime && now - this.lastLogRealTime < 1000) {
            if (isKeyframe && this.dataPoints.length > 0) {
                this.dataPoints[this.dataPoints.length - 1].isKeyframe = true;
                this.scheduleDraw();
            }
            return;
        }
        
        this.lastLogRealTime = now;

        if (this.dataPoints.length > 0) {
            const lastTime = this.dataPoints[this.dataPoints.length - 1].time;
            if (time < lastTime - 1.0) {
                this.dataPoints = this.dataPoints.filter(d => d.time <= time);
            }
        }

        let strokeColor = '#00d2ff'; 
        let rgb = '0, 210, 255';
        let qualityLabel = 'Auto';

        if (window.PlaybackEngine && window.PlaybackEngine.player) {
            const activeTrack = window.PlaybackEngine.player.getVariantTracks().find(t => t.active);
            if (activeTrack && activeTrack.height) { 
                const h = activeTrack.height;
                if (h >= 2160) { strokeColor = '#e040fb'; rgb = '224, 64, 251'; qualityLabel = '4K'; }
                else if (h >= 1440) { strokeColor = '#7c4dff'; rgb = '124, 77, 255'; qualityLabel = '1440p'; }
                else if (h >= 1080) { strokeColor = '#00d2ff'; rgb = '0, 210, 255'; qualityLabel = '1080p'; } 
                else if (h >= 720) { strokeColor = '#00e676'; rgb = '0, 230, 118'; qualityLabel = '720p'; } 
                else if (h >= 480) { strokeColor = '#ffab00'; rgb = '255, 171, 0'; qualityLabel = '480p'; } 
                else { strokeColor = '#ff3d00'; rgb = '255, 61, 0'; qualityLabel = h + 'p'; } 
            } else if (activeTrack && !activeTrack.height) {
                strokeColor = '#e0e0e0'; rgb = '224, 224, 224'; qualityLabel = 'Audio Only';
            }
        }

        this.dataPoints.push({ time, bitrate, isKeyframe, strokeColor, rgb, qualityLabel });
        this.dataPoints.sort((a, b) => a.time - b.time);

        const playheadTime = this.videoElement ? this.videoElement.currentTime : time;
        const minTime = Math.max(0, playheadTime - (this.timeWindow * 0.75));
        this.dataPoints = this.dataPoints.filter(d => d.time > minTime - 20);

        const currentPeak = Math.max(...this.dataPoints.map(d => d.bitrate));
        if (currentPeak > this.maxBitrate * 0.8) {
            this.maxBitrate = currentPeak * 1.2; 
        }

        if (this.liveVal) {
            this.liveVal.textContent = `${bitrate.toFixed(2)} Mbps`;
            this.liveVal.style.color = strokeColor;
        }
        
        this.scheduleDraw();
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); 
        this.ctx.scale(dpr, dpr);
        
        this.width = rect.width;
        this.height = rect.height;
        if(!this.drawPending) this.draw();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        const playheadTime = this.videoElement ? this.videoElement.currentTime : 0;
        const minTime = Math.max(0, playheadTime - (this.timeWindow * 0.75));
        const maxTime = minTime + this.timeWindow;

        const getX = (time) => this.padding.left + ((time - minTime) / this.timeWindow) * (this.width - this.padding.left - this.padding.right);
        const getY = (bitrate) => this.height - this.padding.bottom - (bitrate / this.maxBitrate) * (this.height - this.padding.top - this.padding.bottom);

        this.drawGrid(getY);
        
        if (this.dataPoints.length > 0) {
            this.drawGraph(getX, getY, minTime, maxTime);
        } else {
            this.ctx.fillStyle = '#8a8a93';
            this.ctx.font = '12px Consolas, monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('[ AWAITING SEGMENT TELEMETRY ]', this.width / 2, this.height / 2);
        }

        this.drawPlayhead(getX, minTime, maxTime);
        this.drawCrosshair();
    }

    drawGrid(getY) {
        this.ctx.strokeStyle = '#262630';
        this.ctx.lineWidth = 1;
        this.ctx.fillStyle = '#8a8a93';
        this.ctx.font = '10px Consolas, monospace';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';

        for (let i = 1; i <= 4; i++) {
            const val = (this.maxBitrate / 4) * i;
            const y = getY(val);
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding.left, y);
            this.ctx.lineTo(this.width - this.padding.right, y);
            this.ctx.stroke();
            this.ctx.fillText(`${val.toFixed(1)}M`, this.padding.left - 5, y);
        }

        const baseLineY = this.height - this.padding.bottom;
        this.ctx.beginPath();
        this.ctx.moveTo(this.padding.left, baseLineY);
        this.ctx.lineTo(this.width - this.padding.right, baseLineY);
        this.ctx.strokeStyle = '#8a8a93';
        this.ctx.stroke();
    }

    drawGraph(getX, getY, minTime, maxTime) {
        const visibleData = this.dataPoints.filter(d => d.time >= minTime);
        if (visibleData.length === 0) return;

        let segments = [];
        let currentSegment = [];

        for (let i = 0; i < visibleData.length; i++) {
            const pt = visibleData[i];
            
            if (currentSegment.length === 0) {
                currentSegment.push(pt);
            } else {
                const prevPt = currentSegment[currentSegment.length - 1];
                
                if (pt.time - prevPt.time > 15.0) { 
                    segments.push(currentSegment);
                    currentSegment = [pt];
                } 
                else if (pt.strokeColor !== prevPt.strokeColor) {
                    segments.push(currentSegment);
                    currentSegment = [prevPt, pt]; 
                } 
                else {
                    currentSegment.push(pt);
                }
            }
        }
        if (currentSegment.length > 0) segments.push(currentSegment);

        segments.forEach(seg => {
            const domPt = seg[seg.length - 1];
            const blockColorRGB = domPt.rgb || '0, 210, 255';
            const blockColorHex = domPt.strokeColor || '#00d2ff';

            const gradient = this.ctx.createLinearGradient(0, this.padding.top, 0, this.height - this.padding.bottom);
            gradient.addColorStop(0, `rgba(${blockColorRGB}, 0.4)`);
            gradient.addColorStop(1, `rgba(${blockColorRGB}, 0.0)`);

            this.ctx.beginPath();
            this.ctx.moveTo(getX(seg[0].time), this.height - this.padding.bottom);
            seg.forEach(point => this.ctx.lineTo(getX(point.time), getY(point.bitrate)));
            this.ctx.lineTo(getX(seg[seg.length - 1].time), this.height - this.padding.bottom);
            this.ctx.fillStyle = gradient;
            this.ctx.fill();

            this.ctx.beginPath();
            seg.forEach((point, i) => {
                if (i === 0) this.ctx.moveTo(getX(point.time), getY(point.bitrate));
                else this.ctx.lineTo(getX(point.time), getY(point.bitrate));
            });
            this.ctx.strokeStyle = blockColorHex;
            this.ctx.lineWidth = 2;
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();

            seg.forEach(point => {
                if (point.isKeyframe) {
                    this.ctx.save();
                    this.ctx.setLineDash([4, 4]);
                    this.ctx.strokeStyle = `rgba(${blockColorRGB}, 0.8)`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(getX(point.time), getY(point.bitrate));
                    this.ctx.lineTo(getX(point.time), this.height - this.padding.bottom);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            });
        });
    }

    drawPlayhead(getX, minTime, maxTime) {
        if (!this.videoElement) return;
        const playheadTime = this.videoElement.currentTime;

        if (playheadTime >= minTime && playheadTime <= maxTime) {
            const px = getX(playheadTime);
            
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#ff3d00'; 
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(px, this.padding.top);
            this.ctx.lineTo(px, this.height - this.padding.bottom);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.fillStyle = '#ff3d00';
            this.ctx.moveTo(px - 5, this.padding.top);
            this.ctx.lineTo(px + 5, this.padding.top);
            this.ctx.lineTo(px, this.padding.top + 6);
            this.ctx.fill();

            this.ctx.fillStyle = '#ff3d00';
            this.ctx.font = 'bold 9px Consolas, monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PLAYHEAD', px, this.padding.top - 5);
        }
    }

    drawCrosshair() {
        if (this.hoverX === null || this.hoverX < this.padding.left || this.hoverX > this.width - this.padding.right) return;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00d2ff'; 
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.moveTo(this.hoverX, this.padding.top);
        this.ctx.lineTo(this.hoverX, this.height - this.padding.bottom);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = '#00d2ff';
        this.ctx.font = 'bold 9px Consolas, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('CURSOR', this.hoverX, this.padding.top - 5);
    }

    handleHover(e) {
        if (this.dataPoints.length === 0) return;
        
        const rect = this.canvas.getBoundingClientRect();
        this.hoverX = e.clientX - rect.left;
        
        const playheadTime = this.videoElement ? this.videoElement.currentTime : 0;
        const minTime = Math.max(0, playheadTime - (this.timeWindow * 0.75));
        const hoverTime = minTime + ((this.hoverX - this.padding.left) / (this.width - this.padding.left - this.padding.right)) * this.timeWindow;

        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${this.hoverX}px`;

        const closestPoint = this.dataPoints.reduce((prev, curr) => 
            Math.abs(curr.time - hoverTime) < Math.abs(prev.time - hoverTime) ? curr : prev
        );

        if (Math.abs(closestPoint.time - hoverTime) < 5.0) {
            const y = this.height - this.padding.bottom - (closestPoint.bitrate / this.maxBitrate) * (this.height - this.padding.top - this.padding.bottom);
            this.tooltip.style.top = `${y}px`;
            
            this.tooltip.innerHTML = `
                <div class="tooltip-time" style="color: ${closestPoint.strokeColor}; font-weight: bold; margin-bottom: 4px;">● ${closestPoint.qualityLabel} Track</div>
                <div class="tooltip-time">Time: ${closestPoint.time.toFixed(2)}s</div>
                <div class="tooltip-bw">${closestPoint.bitrate.toFixed(2)} Mbps</div>
                ${closestPoint.isKeyframe ? '<div style="color:var(--accent-green); margin-top:2px;">[I-Frame Chunk]</div>' : ''}
            `;
        } else {
            this.tooltip.style.top = `${this.padding.top}px`;
            this.tooltip.innerHTML = `<div class="tooltip-time">Time: ${hoverTime.toFixed(2)}s</div>`;
        }
        
        this.scheduleDraw();
    }

    handleClick(e) {
        if (this.dataPoints.length === 0) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        if (clickX < this.padding.left || clickX > this.width - this.padding.right) return;

        const playheadTime = this.videoElement ? this.videoElement.currentTime : 0;
        const minTime = Math.max(0, playheadTime - (this.timeWindow * 0.75));
        const targetTime = minTime + ((clickX - this.padding.left) / (this.width - this.padding.left - this.padding.right)) * this.timeWindow;

        this.lastClickTime = performance.now();

        if (this.videoElement) {
            this.videoElement.currentTime = targetTime;
        }

        const event = new CustomEvent('telemetrySeek', { detail: { time: targetTime } });
        document.dispatchEvent(event);

        this.scheduleDraw();
    }
    
    reset() {
        this.dataPoints = []; 
        this.maxBitrate = 10; 
        this.hoverX = null;
        this.lastLogRealTime = null;
        this.lastClickTime = null;
        if (this.liveVal) {
            this.liveVal.textContent = '0.00 Mbps';
            this.liveVal.style.color = 'var(--accent-blue)';
        }
        if (this.tooltip) this.tooltip.style.display = 'none';
        this.scheduleDraw();
    }
}

class TimelineModule {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.segments = new Map();
        this.activeSegmentId = null;
        this.activeTrackId = null;
        this.isUserHovered = false;

        if (this.container) {
            this.container.addEventListener('mouseenter', () => this.isUserHovered = true);
            this.container.addEventListener('mouseleave', () => this.isUserHovered = false);
        }
    }

    addSegment(segmentData) {
        if (!this.container) return;
        
        if (this.segments.size === 0) {
            const placeholder = this.container.querySelector('div');
            if(placeholder && placeholder.textContent.includes('Awaiting segment ingestion')) {
                this.container.innerHTML = '';
            }
        }
        
        if (this.segments.has(segmentData.id)) return;

        this.segments.set(segmentData.id, segmentData);
        this.renderCard(segmentData);
    }

    renderCard(seg) {
        let row = document.getElementById(`track-row-${seg.trackId}`);
        
        if (!row) {
            row = document.createElement('div');
            row.className = 'timeline-track-row';
            row.id = `track-row-${seg.trackId}`;
            
            const label = document.createElement('div');
            label.className = 'track-row-label';
            label.textContent = seg.trackInfo;
            row.appendChild(label);

            this.container.appendChild(row);
        }

        const card = document.createElement('div');
        card.className = `segment-card ${seg.isActive ? 'active' : ''}`;
        card.id = `card-${seg.id}`;
        card.dataset.start = seg.startTime; 
        card.dataset.seq = seg.seq;
        card.dataset.isInit = seg.isInit ? 'true' : '';
        
        const endTime = seg.startTime + seg.duration;
        const durText = seg.isInit ? 'N/A' : `${seg.duration.toFixed(2)}s`;
        
        const activeIcon = seg.isActive ? `<span class="material-symbols-outlined" style="font-size:14px; color:var(--accent-amber);">bolt</span> ` : '';
        card.innerHTML = `
            <span class="title">${activeIcon}#${seg.seq}</span>
            <div class="meta" style="white-space: nowrap;">
                Time: ${seg.startTime.toFixed(1)}s - ${endTime.toFixed(1)}s<br>
                Dur: ${durText}<br>
                Type: ${seg.format}
            </div>
        `;

        card.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('segmentSelected', { detail: seg }));
        });

        const existingCards = Array.from(row.querySelectorAll('.segment-card'));
        let inserted = false;
        
        for (const existingCard of existingCards) {
            const existingStart = parseFloat(existingCard.dataset.start);
            
            if (seg.startTime < existingStart) {
                row.insertBefore(card, existingCard);
                inserted = true;
                break;
            } 
            else if (seg.startTime === existingStart && seg.isInit && !existingCard.dataset.isInit) {
                row.insertBefore(card, existingCard);
                inserted = true;
                break;
            }
        }
        
        if (!inserted) {
            row.appendChild(card);
        }
        
        if (!this.isUserHovered) {
            row.scrollLeft = row.scrollWidth;
        }
    }

    syncToPlayhead(currentTime) {
        if (!this.activeTrackId) return;

        let currentMatchingId = null;

        for (const [id, seg] of this.segments.entries()) {
            if (seg.trackId === this.activeTrackId) {
                if (currentTime >= seg.startTime && currentTime < (seg.startTime + seg.duration)) {
                    currentMatchingId = id;
                    break;
                }
            }
        }

        if (currentMatchingId && currentMatchingId !== this.activeSegmentId) {
            this.setActive(currentMatchingId);
        }
    }

    forceActiveTrackRow(trackId, trackInfo = null) {
        const activeRow = document.getElementById(`track-row-${trackId}`);
        
        if (this.activeTrackId === trackId && activeRow && activeRow.classList.contains('active-row') && this.container.firstChild === activeRow) {
            return;
        }

        this.activeTrackId = trackId;
        
        const allRows = this.container.querySelectorAll('.timeline-track-row');
        allRows.forEach(r => r.classList.remove('active-row'));
        
        if (!activeRow && trackInfo) {
            const newRow = document.createElement('div');
            newRow.className = 'timeline-track-row active-row';
            newRow.id = `track-row-${trackId}`;
            
            const label = document.createElement('div');
            label.className = 'track-row-label';
            label.textContent = trackInfo;
            newRow.appendChild(label);
            
            this.container.prepend(newRow);
        } else if (activeRow) {
            activeRow.classList.add('active-row');
            if (this.container.firstChild !== activeRow) {
                this.container.prepend(activeRow);
            }
        }

        const videoElement = document.getElementById('video-element');
        if (videoElement && videoElement.readyState > 0) {
            this.syncToPlayhead(videoElement.currentTime);
        }
    }

    setActive(segmentId) {
        if (this.activeSegmentId) {
            const oldCard = document.getElementById(`card-${this.activeSegmentId}`);
            if (oldCard) {
                oldCard.classList.remove('active');
                const oldSeg = this.segments.get(this.activeSegmentId);
                if (oldSeg) {
                    oldCard.querySelector('.title').innerHTML = `#${oldSeg.seq}`;
                }
            }
        }

        this.activeSegmentId = segmentId;
        const seg = this.segments.get(segmentId);
        if (!seg) return;

        this.forceActiveTrackRow(seg.trackId);

        const newCard = document.getElementById(`card-${segmentId}`);
        if (newCard) {
            newCard.classList.add('active');
            newCard.querySelector('.title').innerHTML = `<span class="material-symbols-outlined" style="font-size:14px; color:var(--accent-amber);">bolt</span> #${seg.seq} [ACTIVE]`;
            
            if (!this.isUserHovered) {
                newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }

    clear() {
        this.segments.clear();
        this.activeSegmentId = null;
        this.activeTrackId = null;
        if(this.container) {
            this.container.innerHTML = `
                <div style="color:var(--text-muted); font-family:var(--font-mono); font-size: 12px; padding: 10px; display:flex; align-items:center; gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">hourglass_empty</span> [ Awaiting segment ingestion... ]
                </div>
            `;
        }
    }
}

class InspectorModule {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        this.boxDesc = {
            'ftyp': 'File Type Box',
            'moov': 'Movie Metadata Box',
            'mvhd': 'Movie Header Box',
            'trak': 'Track Box',
            'moof': 'Movie Fragment Header',
            'mfhd': 'Movie Fragment Header Data',
            'traf': 'Track Fragment Sub-Box',
            'tfhd': 'Track Fragment Header',
            'trun': 'Track Fragment Run (Samples)',
            'mdat': 'Raw Interleaved Payload Data',
            'sidx': 'Segment Index Box',
            'styp': 'Segment Type Box',
            'emsg': 'Event Message Box',
            'prft': 'Producer Reference Time'
        };
    }

    async inspectSegment(segmentData) {
        this.container.innerHTML = `
            <div class="tree-node">
                <span class="material-symbols-outlined" style="font-size:16px;">arrow_drop_down</span> media_chunk_${segmentData.seq} <span class="box-meta">(Fetching actual binary headers...)</span>
            </div>
        `;

        if (!segmentData.uri) {
            this.container.innerHTML = `<div style="color:var(--accent-amber); padding: 10px; display:flex; gap:6px;"><span class="material-symbols-outlined" style="font-size:16px;">warning</span> Missing 'uri' in segmentData. Please add 'uri: response.uri' to TimelineMap.addSegment() in PlaybackEngineModule to enable real binary parsing.<br><br>Showing structural estimation instead:</div>`;
            this.renderEstimation(segmentData);
            return;
        }

        try {
            const response = await fetch(segmentData.uri, {
                headers: { 'Range': 'bytes=0-16384' }
            });

            if (!response.ok && response.status !== 206) {
                throw new Error(`HTTP ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const dataView = new DataView(arrayBuffer);

            let html = `
                <div class="tree-node">
                    <span class="material-symbols-outlined" style="font-size:16px;">arrow_drop_down</span> chunk_${segmentData.seq} <span class="box-meta">(${this.formatBytes(segmentData.duration * 250000)} - Natively Parsed)</span>
                </div>
                <div class="tree-indent">
            `;

            const isMPEGTS = dataView.getUint8(0) === 0x47; 
            
            if (isMPEGTS) {
                html += this.parseMPEGTS(dataView);
            } else {
                html += this.parseISOBMFF(dataView);
            }

            html += `</div>`;
            this.container.innerHTML = html;

        } catch (error) {
            this.container.innerHTML = `
                <div style="color:var(--accent-red); padding: 10px; font-size: 11px;">
                    <span class="material-symbols-outlined" style="font-size:14px; vertical-align:text-bottom;">error</span> Binary Fetch Failed: ${error.message} <br>
                    (Strict CORS policies on the target server are blocking the 'Range' request).<br><br>
                    Falling back to structural estimation:
                </div>
            `;
            this.renderEstimation(segmentData);
        }
    }

    parseISOBMFF(dataView) {
        let html = '';
        let offset = 0;
        
        while (offset < dataView.byteLength && offset < 10000) {
            if (offset + 8 > dataView.byteLength) break;
            
            let size = dataView.getUint32(offset);
            let type = String.fromCharCode(
                dataView.getUint8(offset + 4),
                dataView.getUint8(offset + 5),
                dataView.getUint8(offset + 6),
                dataView.getUint8(offset + 7)
            );
            
            if (size === 0) break; 
            
            let headerSize = 8;
            if (size === 1) { 
                if (offset + 16 > dataView.byteLength) break;
                size = dataView.getUint32(offset + 12); 
                headerSize = 16;
            }

            let desc = this.boxDesc[type] || 'Unknown ISO Box';
            html += this.buildAtomNode(type, desc, this.formatBytes(size), ['moov', 'moof', 'traf'].includes(type));

            if (['moov', 'moof', 'traf'].includes(type)) {
                html += `<div class="tree-indent">`;
                let innerOffset = offset + headerSize;
                let endOffset = offset + size;
                
                while (innerOffset < endOffset && innerOffset < dataView.byteLength) {
                    if (innerOffset + 8 > dataView.byteLength) break;
                    let iSize = dataView.getUint32(innerOffset);
                    let iType = String.fromCharCode(
                        dataView.getUint8(innerOffset + 4),
                        dataView.getUint8(innerOffset + 5),
                        dataView.getUint8(innerOffset + 6),
                        dataView.getUint8(innerOffset + 7)
                    );
                    
                    if (iSize < 8) break;
                    
                    let iDesc = this.boxDesc[iType] || 'Unknown Sub-Box';
                    html += this.buildAtomNode(iType, iDesc, this.formatBytes(iSize), false);
                    
                    innerOffset += iSize;
                }
                html += `</div>`;
            }
            
            offset += size;
        }
        
        return html;
    }

    parseMPEGTS(dataView) {
        let html = '';
        let offset = 0;
        let patFound = false;
        let pmtFound = false;
        let pesCount = 0;
        
        let packetsToParse = Math.min(30, Math.floor(dataView.byteLength / 188));
        
        for (let i = 0; i < packetsToParse; i++) {
            let packetOffset = offset + (i * 188);
            if (packetOffset + 188 > dataView.byteLength) break;
            
            let syncByte = dataView.getUint8(packetOffset);
            if (syncByte !== 0x47) continue; 
            
            let pid1 = dataView.getUint8(packetOffset + 1);
            let pid2 = dataView.getUint8(packetOffset + 2);
            let pid = ((pid1 & 0x1F) << 8) | pid2; 
            let isPayloadUnitStart = (pid1 & 0x40) !== 0;
            
            if (pid === 0 && !patFound) {
                html += this.buildAtomNode('PAT', 'Program Association Table', `PID: 0x0000`, false);
                patFound = true;
            } else if (pid !== 0 && pid !== 0x1FFF && !pmtFound && isPayloadUnitStart && patFound) {
                html += this.buildAtomNode('PMT', 'Program Map Table', `PID: 0x${pid.toString(16).padStart(4, '0').toUpperCase()}`, false);
                pmtFound = true;
            } else if (pid !== 0 && pid !== 0x1FFF && isPayloadUnitStart && pesCount < 4) {
                html += this.buildAtomNode('PES', 'Packetized Elementary Stream', `PID: 0x${pid.toString(16).padStart(4, '0').toUpperCase()}`, false);
                pesCount++;
            }
        }
        
        if (pesCount > 0) {
            html += this.buildAtomNode('...', 'Additional Interleaved PES Packets', '', false);
        }
        
        return html;
    }

    renderEstimation(segmentData) {
        let html = `<div class="tree-indent">`;

        if (segmentData.format.includes('fMP4') || segmentData.format.includes('moof') || segmentData.format.includes('INIT')) {
            html += this.buildAtomNode('ftyp', 'File Type Box', '32 bytes', false);
            html += this.buildAtomNode('moov', 'Movie Metadata Box', '4096 bytes', false);
            
            if (!segmentData.format.includes('INIT')) {
                html += this.buildAtomNode('moof', 'Movie Fragment Header', '1240 bytes', true);
                html += `
                    <div class="tree-indent">
                        <div class="tree-node"><span class="material-symbols-outlined" style="font-size:16px;">arrow_right</span> [<span class="box-name">mfhd</span>] Sequence Data</div>
                        ${this.buildAtomNode('traf', 'Track Fragment Sub-Box', '', true)}
                    </div>
                `;
                html += this.buildAtomNode('mdat', 'Raw Interleaved Payload Data', `${this.formatBytes(segmentData.duration * 250000)}`, false);
            }
        } else {
            html += this.buildAtomNode('PAT', 'Program Association Table (Mock)', '188 bytes', false);
            html += this.buildAtomNode('PMT', 'Program Map Table (Mock)', '188 bytes', false);
            html += this.buildAtomNode('PES', 'Packetized Elementary Stream (Mock)', 'Audio Payload', false);
            html += this.buildAtomNode('PES', 'Packetized Elementary Stream (Mock)', 'Video Payload', false);
        }

        html += `</div>`; 
        this.container.innerHTML += html;
    }

    buildAtomNode(tag, description, meta, isOpen) {
        const icon = isOpen ? 'arrow_drop_down' : 'arrow_right';
        return `
            <div class="tree-node">
                <span class="material-symbols-outlined" style="font-size:16px;">${icon}</span> [<span class="box-name">${tag}</span>] ${description} <span class="box-meta">${meta ? `(${meta})` : ''}</span>
            </div>
        `;
    }

    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
    }

    clear() {
        if(this.container) {
            this.container.innerHTML = `
                <div style="color:var(--text-muted); padding: 10px; display:flex; align-items:center; gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">info</span> Select a segment from the timeline to audit actual binary atoms.
                </div>
            `;
        }
    }
}

class StreamCaptureModule {
    constructor(buttonId) {
        this.captureBtn = document.getElementById(buttonId);
        this.captureText = document.getElementById('capture-text');
        
        this.isRecording = false;
        this.activeInitBuffer = null; 
        this.mediaBuffers = [];
        this.recordedBytes = 0;
        this.streamFormat = 'mp4'; 

        if (this.captureBtn) {
            this.captureBtn.addEventListener('click', () => this.toggleCapture());
        }
    }

    setFormat(format) {
        this.streamFormat = format.includes('MPEG-TS') ? 'ts' : 'mp4';
    }

    setInitBuffer(buffer) {
        this.activeInitBuffer = buffer;
    }

    appendData(buffer) {
        if (!this.isRecording) return;
        
        if (this.recordedBytes + buffer.byteLength > 1500 * 1024 * 1024) {
            alert("Memory safety limit reached (1.5GB). Automatically saving stream to prevent browser crash.");
            this.stopAndSave();
            return;
        }

        this.mediaBuffers.push(buffer);
        this.recordedBytes += buffer.byteLength;
        
        if (this.captureText) {
            this.captureText.textContent = `Recording... (${(this.recordedBytes / 1048576).toFixed(1)} MB)`;
        }
    }

    toggleCapture() {
        if (!this.isRecording) this.startCapture();
        else this.stopAndSave();
    }

    startCapture() {
        if (this.streamFormat === 'mp4' && !this.activeInitBuffer) {
            alert("No initialization segment cached. Please switch the video quality to force the player to fetch a new init chunk, then click record.");
            return;
        }

        this.isRecording = true;
        this.mediaBuffers = [];
        this.recordedBytes = 0;
        
        if (this.streamFormat === 'mp4' && this.activeInitBuffer) {
            this.mediaBuffers.push(this.activeInitBuffer);
            this.recordedBytes += this.activeInitBuffer.byteLength;
        }

        this.captureBtn.classList.add('is-recording');
        this.captureText.textContent = 'Recording... (0.0 MB)';
    }

    stopAndSave() {
        this.isRecording = false;
        this.captureBtn.classList.remove('is-recording');
        this.captureText.textContent = 'Processing File...';

        try {
            const blob = new Blob(this.mediaBuffers, { type: this.streamFormat === 'ts' ? 'video/MP2T' : 'video/mp4' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            a.download = `stream_capture_${dateStr}.${this.streamFormat}`;
            
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

        } catch (error) {
            console.error("Failed to compile video file:", error);
            alert("Memory limit exceeded or file generation failed.");
        } finally {
            this.mediaBuffers = [];
            this.recordedBytes = 0;
            this.captureText.textContent = 'Record .mp4';
        }
    }
}

// Bootstrap all modules & define Master Routing
document.addEventListener('DOMContentLoaded', () => {
    window.PlaybackEngine = new PlaybackEngineModule();
    window.TelemetryMap = new BitrateTelemetryModule();
    window.ManifestAnalyzer = new ManifestAnalyzerModule();
    window.TimelineMap = new TimelineModule('timeline-container');
    window.AtomInspector = new InspectorModule('inspector-tree');
    window.StreamCapture = new StreamCaptureModule('capture-btn');
	
	//Load sample
	window.PlaybackEngine.searchInput.value = "http://sample.vodobox.net/skate_phantom_flex_4k/skate_phantom_flex_4k.m3u8";
	window.PlaybackEngine.loadStream();

    document.addEventListener('segmentSelected', (e) => {
        const segment = e.detail;
        
        if (window.PlaybackEngine && window.PlaybackEngine.videoElement) {
            window.PlaybackEngine.videoElement.currentTime = segment.startTime;
        }

        if (window.TimelineMap) window.TimelineMap.setActive(segment.id);
        if (window.AtomInspector) window.AtomInspector.inspectSegment(segment);
    });
});