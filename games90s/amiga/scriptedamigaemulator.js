/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function set_special(x) { AMIGA.spcflags |= x; }
function clr_special(x) { AMIGA.spcflags &= ~x; }
 
function Amiga() {
	this.info = {
		version: SAEV_Version+'.'+SAEV_Revision+'.'+SAEV_Revision_Sub,
		browser_name: BrowserDetect.browser,
		browser_version: BrowserDetect.version,
		os: BrowserDetect.OS,
		video:0,
		audio:0
	};
	this.config = new Config();
	this.mem = new Memory();
	this.expansion = new Expansion();
	this.input = new Input();
	this.serial = new Serial();
	this.events = new Events();
	this.disk = new Disk();
	this.cia = new CIA();
	this.rtc = new RTC();
	this.custom = new Custom();
	this.blitter = new Blitter();
	this.copper = new Copper();
	this.playfield = new Playfield();
	this.video = new Vide0();
	this.audio = new Audi0();
	this.cpu = new CPU();

	this.state = ST_STOP;
	this.delay = 0;
	this.spcflags = 0;
	//this.loading = 0;
		
	this.intena = 0;
	this.intreq = 0;
	this.dmacon = 0;
	this.adkcon = 0;
	
	this.info.video = this.video.available; 
	this.info.audio = this.audio.available; 
	
	/*---------------------------------*/

	this.setup = function () {
		this.mem.setup();
		this.expansion.setup();
		this.events.setup();
		this.playfield.setup();
		this.video.setup();
		this.cia.setup();
		this.rtc.setup();
		this.input.setup();
		this.disk.setup();
		this.audio.setup();
		this.custom.setup();
		this.cpu.setup();
	};

	this.cleanup = function () {
		this.audio.cleanup();
		this.video.cleanup();
		this.playfield.cleanup();
		this.input.cleanup();
	};

	this.reset = function () {
		BUG.info('Amiga.reset()');

		this.delay = 0;
		this.spcflags = 0;
		//this.loading = 0;

		this.intena = 0;
		this.intreq = 0;
		this.dmacon = 0;
		this.adkcon = 0;

		this.expansion.reset();
		this.events.reset();
		this.playfield.reset();
		this.cia.reset();
		this.disk.reset();
		this.input.reset();
		this.serial.reset();
		this.blitter.reset();
		this.copper.reset();
		this.audio.reset();
		this.custom.reset();
		this.cpu.reset(this.mem.rom.lower);
	};

	this.dump = function () {
		this.cpu.dump();
		//this.cia.dump();
	};
	
	/*---------------------------------*/

	/*this.waitForStart = function() {
		if (this.loading)
			setTimeout('AMIGA.waitForStart()', 10);
		else {
			this.reset();
			this.state = ST_CYCLE;
			setTimeout('AMIGA.cycle()', 0);
		}
	}
	this.start = function() {
		this.setup();
		this.waitForStart();
	}*/
	
	
	this.start = function () {
		if (this.state == ST_STOP) {
			this.setup();
			this.reset();
			this.state = ST_CYCLE;
			setTimeout('AMIGA.cycle()', 0);
		}
	};
	
	this.stop = function () {
		if (this.state != ST_STOP) {
			this.state = ST_STOP;
			this.cleanup();
		}
	};
	
	this.pause = function (state) {
		if (this.state != ST_STOP) {
			this.state = state ? ST_PAUSE : ST_CYCLE;
			this.audio.pauseResume(state);
		}
	};
	
	/*this.insert = function(unit, name, data) {
		//this.disk.insert_data(unit, data);		
		this.disk.insert(unit, name, data);
		this.config.floppy.drive[unit].name = name;
	}
	this.eject = function(unit) {
		if (this.config.floppy.drive[unit].name) {
			this.disk.eject(unit);
			//this.disk.eject_data(unit);
			this.config.floppy.drive[unit].name = null;
			BUG.info('amiga.eject() DF%d ejected', unit);
		} else
			BUG.info('amiga.eject() DF%d in empty', unit);
	}
	*/
	
	this.insert = function (unit) {
		if (this.state != ST_STOP)
			this.disk.insert(unit);
	};
		
	this.eject = function (unit) {
		if (this.state != ST_STOP)
			this.disk.eject(unit);
	};

	/*---------------------------------*/
	/* mainloop */	
	
	this.cycle = function () {
		try {
			this.cpu.cycle();
		} catch (e) {
			if (e instanceof VSync) {
				//console.log(e.error, e.message);
				this.state = ST_IDLE;
			} else if (e instanceof FatalError) {
				this.state = ST_STOP;
				this.stop();
				this.config.hooks.error(e.error, e.message);
			} else /* normal exception */ {
				this.state = ST_STOP;
				this.stop();
				console.log(e);
			}
		}
		if (this.state == ST_IDLE) {
			this.state = ST_CYCLE;
			setTimeout('AMIGA.cycle()', this.delay);
		}
		else if (this.state == ST_PAUSE)
			AMIGA.cyclePause();
		else
			AMIGA.cycleExit();
	};

	this.cyclePause = function () {
		if (this.state == ST_CYCLE)
			setTimeout('AMIGA.cycle()', 0);
		else if (this.state == ST_PAUSE)
			setTimeout('AMIGA.cyclePause()', 500);
		else
			AMIGA.cycleExit();
	};
	
	this.cycleExit = function () {
		this.dump();
		//this.cia.dump();
	};
		
	/*---------------------------------*/

	this.dmaen = function (dmamask) {
		return ((this.dmacon & DMAF_DMAEN) != 0 && (this.dmacon & dmamask) != 0);
	};

	this.DMACONR = function (hpos) {
		this.playfield.decide_line(hpos);
		this.playfield.decide_fetch(hpos);
		this.dmacon &= ~(0x4000 | 0x2000);
		var iz = this.blitter.getIntZero();
		this.dmacon |= ((iz[0] ? 0 : 0x4000) | (iz[1] ? 0x2000 : 0));
		return this.dmacon;
	};

	this.DMACON = function (v, hpos) {
		var oldcon = this.dmacon;

		this.playfield.decide_line(hpos);
		this.playfield.decide_fetch(hpos);

		if (v & INTF_SETCLR)
			this.dmacon |= v & ~INTF_SETCLR;
		else
			this.dmacon &= ~v;

		this.dmacon &= 0x1fff;

		var changed = this.dmacon ^ oldcon;

		var oldcop = (oldcon & DMAF_COPEN) != 0 && (oldcon & DMAF_DMAEN) != 0;
		var newcop = (this.dmacon & DMAF_COPEN) != 0 && (this.dmacon & DMAF_DMAEN) != 0;
		if (oldcop != newcop) {
			if (newcop && !oldcop) {
				this.copper.compute_spcflag_copper(this.events.hpos());
			} else if (!newcop) {
				this.copper.enabled_thisline = false;
				clr_special(SPCFLAG_COPPER);
			}
		}
		if ((this.dmacon & DMAF_BLTPRI) > (oldcon & DMAF_BLTPRI) && this.blitter.getState() != BLT_done)
			set_special(SPCFLAG_BLTNASTY);
		if (this.dmaen(DMAF_BLTEN) && this.blitter.getState() == BLT_init)
			this.blitter.setState(BLT_work);
		if ((this.dmacon & (DMAF_BLTPRI | DMAF_BLTEN | DMAF_DMAEN)) != (DMAF_BLTPRI | DMAF_BLTEN | DMAF_DMAEN))
			clr_special(SPCFLAG_BLTNASTY);

		if (changed & (DMAF_DMAEN | 0x0f))
			this.audio.state_machine();

		if (changed & (DMAF_DMAEN | DMAF_BPLEN)) {
			this.playfield.update_ddf_change();
			if (this.dmaen(DMAF_BPLEN))
				this.playfield.maybe_start_bpl_dma(hpos);
		}
		this.events.schedule();
	};
	
	/*---------------------------------*/

	this.ADKCONR = function () {
		return this.adkcon;
	};

	this.ADKCON = function (v, hpos) {
		if (this.config.audio.enabled)
			this.audio.update();

		this.disk.update(hpos);
		this.disk.update_adkcon(v);

		if (v & INTF_SETCLR)
			this.adkcon |= v & ~INTF_SETCLR;
		else
			this.adkcon &= ~v;

		this.audio.update_adkmasks();
	};

	/*---------------------------------*/

	this.INTENAR = function () {
		return this.intena;
	};

	this.INTENA = function (v) {
		if (v & INTF_SETCLR)
			this.intena |= v & ~INTF_SETCLR;
		else
			this.intena &= ~v;

		if (v & INTF_SETCLR)
			this.doint();
	};

	/*---------------------------------*/

	this.INTREQR = function () {
		return this.intreq;
	};

	this.INTREQ_0 = function (v) {
		var old = this.intreq;

		if (v & INTF_SETCLR)
			this.intreq |= v & ~INTF_SETCLR;
		else
			this.intreq &= ~v;

		if ((v & INTF_SETCLR) && this.intreq != old)
			this.doint();
	};

	this.INTREQ = function (v) {
		this.INTREQ_0(v);
		this.cia.rethink();
	};

	/*---------------------------------*/

	this.intlev = function () {
		var imask = this.intreq & this.intena;

		if (imask && (this.intena & INTF_INTEN)) {
			if (imask & 0x2000) return 6;
			if (imask & 0x1800) return 5;
			if (imask & 0x0780) return 4;
			if (imask & 0x0070) return 3;
			if (imask & 0x0008) return 2;
			if (imask & 0x0007) return 1;
		}
		return -1;
	};

	this.doint = function() {
		if (AMIGA.config.cpu.compatible)
			set_special(SPCFLAG_INT);
		else
			set_special(SPCFLAG_DOINT);        
	}
}

/*-----------------------------------------------------------------------*/
/* This API will change in the future. */

var BUG = null;
var AMIGA = null;

function SAE(x) {
	try {
		switch (x.cmd) {
			case 'init':
				BUG = new Debug();
				BUG.info('API.init() SEA %d.%d.%d', SAEV_Version, SAEV_Revision, SAEV_Revision_Sub);

				AMIGA = new Amiga();
				//return AMIGA.config;
				break;
			case 'reset':
				BUG.info('API.reset()');
				AMIGA.reset();
				break;
			case 'start':
				BUG.info('API.start()');
				AMIGA.start();
				break;
			case 'stop':
				BUG.info('API.stop()');
				AMIGA.stop();
				break;
			case 'pause':
				BUG.info('API.pause() %d', x.state);
				AMIGA.pause(x.state);
				break;
			/*case 'insert':
				BUG.info('API.insert() DF%d, name "%s", length %d', x.unit, x.name, x.data.length);
				AMIGA.insert(x.unit, x.name, x.data);
				break;*/
			case 'insert':
				BUG.info('API.insert() DF%d', x.unit);
				AMIGA.insert(x.unit);
				break;
			case 'eject':
				BUG.info('API.eject() DF%d', x.unit);
				AMIGA.eject(x.unit);
				break;
			case 'getInfo':
				BUG.info('API.getInfo()');
				return AMIGA.info;
			case 'getConfig':
				BUG.info('API.getConfig()');
				return AMIGA.config;
			/*case 'setConfig':
				BUG.info('API.setConfig() size '+x.data.ext.size);
				AMIGA.config = x.data;
				break;*/
		}		
	} catch (e) {
		if (e instanceof FatalError) {
			AMIGA.stop();
			//return { error:e.error, message:e.message };
			AMIGA.config.hooks.error(e.error, e.message);
		} else
			console.log(e);		
	}
	//return SAEE_None;
	//return { error:SAEE_None, message:'' };
	return 0;
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

/*const DEBUG_CHANNEL_MASK = 15
function debugchannel(ch) {
	return ((1 << ch) & DEBUG_CHANNEL_MASK) != 0;
}*/

function Filter() {
	const DENORMAL_OFFSET = 1E-10;

	this.on = false;
	this.led_filter_on = false;

	var filter_state = [
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 },
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 },
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 },
		{ rc1:0,rc2:0,rc3:0,rc4:0,rc5:0 }
	];
	var filter1_a0 = 0;
	var filter2_a0 = 0;
	var filter_a0 = 0;

	function calc(sample_rate, cutoff_freq) {
		if (cutoff_freq >= sample_rate / 2)
			return 1.0;

		var omega = 2 * Math.PI * cutoff_freq / sample_rate;
		omega = Math.tan(omega / 2) * 2;
		return 1 / (1 + 1 / omega);
	}

	this.setup = function (on, sample_rate) {
		this.on = on;
		filter1_a0 = calc(sample_rate, 6200);
		filter2_a0 = calc(sample_rate, 20000);
		filter_a0 = calc(sample_rate, 7000);
		/*console.log(sample_rate);
		 console.log(filter1_a0);
		 console.log(filter2_a0);
		 console.log(filter_a0);*/
	};

	this.reset = function () {
		filter_state = [
			{ rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 },
			{ rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 },
			{ rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 },
			{ rc1: 0, rc2: 0, rc3: 0, rc4: 0, rc5: 0 }
		];
	};

	this.filter = function(input, state) {
		//if (!this.on) return input;
		var o, fs = filter_state[state];

		fs.rc1 = filter1_a0 * input  + (1 - filter1_a0) * fs.rc1 + DENORMAL_OFFSET;
		fs.rc2 = filter2_a0 * fs.rc1 + (1 - filter2_a0) * fs.rc2;
		var no = fs.rc2;

		if (this.led_filter_on) {
			fs.rc3 = filter_a0 * no     + (1 - filter_a0) * fs.rc3;
			fs.rc4 = filter_a0 * fs.rc3 + (1 - filter_a0) * fs.rc4;
			fs.rc5 = filter_a0 * fs.rc4 + (1 - filter_a0) * fs.rc5;
			o = Math.floor(fs.rc5);
		} else
			o = Math.floor(no);

		return o > 32767 ? 32767 : (o < -32768 ? -32768 : o);
	}
}

function Channel(num) {
	this.num = num;
	this.enabled = false;
	this.evtime = 0;
	this.dmaenstore = false;
	this.intreq = false;
	this.dr = false;
	this.dsr = false;
	this.pbufldl = false;
	this.dat_written = false;
	this.state = 0;
	this.lc = 0;
	this.pt = 0;
	this.per = 0;
	this.vol = 0;
	this.len = 0;
	this.wlen = 0;
	this.dat = 0;
	this.dat2 = 0;
	this.current_sample = 0;
	this.last_sample = 0;
	this.ptx = 0;
	this.ptx_written = false;
	this.ptx_tofetch = false;
	
	this.reset = function () {
		this.enabled = false;
		this.evtime = CYCLE_MAX;
		this.dmaenstore = false;
		this.intreq = false;
		this.dr = false;
		this.dsr = false;
		this.pbufldl = false;
		this.dat_written = false;
		this.state = 0;
		this.lc = 0;
		this.pt = 0;
		this.per = PERIOD_MAX - 1;
		this.vol = 0;
		this.len = 0;
		this.wlen = 0;
		this.dat = 0;
		this.dat2 = 0;
		this.current_sample = 0;
		this.last_sample = 0;
		this.ptx = 0;
		this.ptx_written = false;
		this.ptx_tofetch = false;
	};
	
	//const audio_channel_mask = 15;
	this.newsample = function (sample) {
		//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].newsample() %02x', nr, sample);
		//if (!(audio_channel_mask & (1 << this.num))) sample = 0;
		if (sample & 0x80) sample -= 0x100;
		this.last_sample = this.current_sample;
		this.current_sample = sample;
	};
	
	this.isirq = function () {
		return (AMIGA.INTREQR() & (0x80 << this.num)) != 0;
	};

	this.setirq = function (which) {
		//if (debugchannel(this.num) && this.wlen > 1) BUG.info('Audio.channel[%d].setirq() %d, %d', this.num, which, this.isirq() ? 1 : 0);
		AMIGA.INTREQ_0(INTF_SETCLR | (0x80 << this.num));
	};

	this.zerostate = function () {
		//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].zerostate()', this.num);
		this.state = 0;
		this.evtime = CYCLE_MAX;
		this.intreq = false;
		this.dmaenstore = false;
	};
	
	this.setdr = function () {
		//if (debugchannel(this.num) && this.dr) BUG.info('Audio.channel[%d].setdr() DR already active (STATE %d)', this.num, this.state);
		this.dr = true;
		if (this.wlen == 1) {
			this.dsr = true;
			//if (debugchannel(this.num) && this.wlen > 1) BUG.info('Audio.channel[%d].setdr() DSR on, pt %08x', this.num, this.pt);
		}
	};

	this.loaddat = function (modper) {
		var audav = (AMIGA.adkcon & (0x01 << this.num)) != 0;
		var audap = (AMIGA.adkcon & (0x10 << this.num)) != 0;
		if (audav || (modper && audap)) {
			if (this.num >= 3)
				return;
			if (modper && audap) {
				if (this.dat == 0)
					AMIGA.audio.channel[this.num + 1].per = PERIOD_MAX;
				else if (this.dat > PERIOD_MIN)
					AMIGA.audio.channel[this.num + 1].per = this.dat * CYCLE_UNIT;
				else
					AMIGA.audio.channel[this.num + 1].per = PERIOD_MIN * CYCLE_UNIT;
			} else if (audav) {
				AMIGA.audio.channel[this.num + 1].vol = this.dat;
				AMIGA.audio.channel[this.num + 1].vol &= 127;
				if (AMIGA.audio.channel[this.num + 1].vol > 64)
					AMIGA.audio.channel[this.num + 1].vol = 64;
			}
		} else {
			//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].loaddat() new %04x, old %04x', this.num, this.dat, this.dat2);
			this.dat2 = this.dat;
		}
	};

	this.loadper = function () {
		this.evtime = this.per;
		if (this.evtime < CYCLE_UNIT)
			BUG.info('Audio.channel[%d].loadper() bug %d', this.num, this.evtime);
	};
	
	this.state_channel = function (perfin) {
		this.state_channel2(perfin);
		this.dat_written = false;
	};

	this.state_channel2 = function(perfin) {
		var chan_ena = ((AMIGA.dmacon & DMAF_DMAEN) && (AMIGA.dmacon & (1 << this.num))) ? true : false;
		var old_dma = this.dmaenstore;
		var audav = (AMIGA.adkcon & (0x01 << this.num)) != 0;
		var audap = (AMIGA.adkcon & (0x10 << this.num)) != 0;
		var napnav = (!audav && !audap) || audav;
		this.dmaenstore = chan_ena;

		if (!AMIGA.config.audio.enabled) {
			this.zerostate();
			return;
		}
		AMIGA.audio.activate();

		if ((this.state == 2 || this.state == 3) && AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && !chan_ena && old_dma) {
			//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() INSTADMAOFF', this.num);
			this.newsample(this.dat2 & 0xff);
			if (napnav)
				this.setirq(91);
			this.zerostate();
			return;
		}

		//if (debugchannel(this.num) && old_dma != chan_ena) BUG.info('Audio.channel[%d].state_channel2() DMA %d, IRQ %d', this.num, chan_ena ? 1 : 0, this.isirq() ? 1 : 0);
		
		switch (this.state) {
			case 0: {
				if (chan_ena) {
					this.evtime = CYCLE_MAX;
					this.state = 1;
					this.dr = true;
					this.wlen = this.len;
					this.ptx_written = false;
					if (this.wlen > 2)
						this.ptx_tofetch = true;
					this.dsr = true;
					//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() 0>1, LEN %d', this.num, this.wlen);
				} else if (this.dat_written && !this.isirq()) {
					this.state = 2;
					this.setirq(0);
					this.loaddat(false);
					if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && this.per < 10 * CYCLE_UNIT) {
						this.newsample(this.dat2 & 0xff);
						this.zerostate();
					} else {
						this.pbufldl = true;
						this.state_channel2(false);
					}
				} else {
					this.zerostate();
				}
				break;
			}
			case 1: {
				this.evtime = CYCLE_MAX;
				if (!chan_ena) {
					this.zerostate();
					return;
				}
				if (!this.dat_written)
					return;
				this.setirq(10);
				this.setdr();
				if (this.wlen != 1) {
					//this.wlen = (this.wlen - 1) & 0xffff;
					if ((--this.wlen) < 0) this.wlen = 0xffff;
				}
				this.state = 5;
				break;
			}
			case 5: {
				this.evtime = CYCLE_MAX;
				if (!chan_ena) {
					this.zerostate();
					return;
				}
				if (!this.dat_written)
					return;
				//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() >5, LEN %d', this.num, this.wlen);
				if (this.ptx_written) {
					this.ptx_written = false;
					this.lc = this.ptx;
				}
				this.loaddat(false);
				if (napnav)
					this.setdr();
				this.state = 2;
				this.loadper();
				this.pbufldl = true;
				this.intreq = false;
				this.state_channel2(false);
				break;
			}
			case 2: {
				if (this.pbufldl) {
					this.newsample((this.dat2 >> 8) & 0xff);
					this.loadper();
					this.pbufldl = false;
				}
				if (!perfin)
					return;
				if (audap)
					this.loaddat(true);
				if (chan_ena) {
					if (audap)
						this.setdr();
					if (this.intreq && audap)
						this.setirq(21);
				} else {
					if (audap)
						this.setirq(22);
				}
				this.pbufldl = true;
				this.state = 3;
				this.state_channel2(false);
				break;
			}
			case 3: {
				if (this.pbufldl) {
					this.newsample((this.dat2 >> 0) & 0xff);
					this.loadper();
					this.pbufldl = false;
				}
				if (!perfin)
					return;
				if (chan_ena) {
					this.loaddat(false);
					if (this.intreq && napnav)
						this.setirq(31);
					if (napnav)
						this.setdr();
				} else {
					if (this.isirq()) {
						//if (debugchannel(this.num)) BUG.info('Audio.channel[%d].state_channel2() IDLE', this.num);
						this.zerostate();
						return;
					}
					this.loaddat(false);
					if (napnav)
						this.setirq(32);
				}
				this.intreq = false;
				this.pbufldl = true;
				this.state = 2;
				this.state_channel2(false);
				break;
			}
		}
	}
}

function Audi0() {
	const SAMPLE_BUFFER_SIZE = 8192;
	this.available = 0;

	var channel = null;

	var last_cycles = 0;
	var next_sample_evtime = 0;
	var scaled_sample_evtime_orig = 0;
	var scaled_sample_evtime = 0;

	var amiga_sample_rate = 0;
	
	var work_to_do = 0;
	var prevcon = -1;
	
	var driver = {
		ctx: null,
		node: null,
		paused:false
	};
	var sampleBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		pos: 0
	};	
	var resampleBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		len: 0
	};		
	var queueBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		usage: 0
	};	
	var outputBuffer = {
		size: 0,
		data: {
			left: null,
			right: null
		},
		len: 0
	};	
	
	this.filter = new Filter();

	/*---------------------------------*/

	//this.init = function()	
	{
		var test;

		try {
			test = new AudioContext();
			if (test && (test.createJavaScriptNode || test.createScriptProcessor))
				this.available |= SAEI_Audio_WebAudio;
			test = null;
		} catch (e) {}

		//console.log(this.available);
	}		

	/*---------------------------------*/
			
	/*this.calc_sample_evtime = function (hz, longframe, linetoggle) {
		var lines = AMIGA.playfield.maxvpos_nom;
		var hpos = AMIGA.playfield.maxhpos_short;
 
		if (Math.abs(hz-50) < 2)
			amiga_sample_rate	= CHIPSET_CLOCK_PAL / 123;
		else
			amiga_sample_rate	= CHIPSET_CLOCK_NTSC / 124;
		
		if (linetoggle) {
			hpos += 0.5;
			lines += 0.5;
		} else {
			if (longframe < 0)
				lines += 0.5;
			else if (longframe > 0)
				lines += 1.0;
		}	
		scaled_sample_evtime_orig = hpos * lines * hz / amiga_sample_rate * CYCLE_UNIT;			
		scaled_sample_evtime = scaled_sample_evtime_orig;
		
		BUG.info('Audio.calc_sample_evtime() hmax %d, vmax %d, hz %f, rate %f | scaled_sample_evtime %f', hpos, lines, hz, amiga_sample_rate, scaled_sample_evtime * CYCLE_UNIT_INV);
	};*/
	
	this.calc_sample_evtime = function (hz, longframe, linetoggle) {
		if (Math.abs(hz - 50.0) <= 1.5) {
			amiga_sample_rate	= CHIPSET_CLOCK_PAL / 123;
			scaled_sample_evtime_orig = 123 * CYCLE_UNIT;	
			BUG.info('Audio.calc_sample_evtime() PAL mode, rate %f, scaled_sample_evtime %f', amiga_sample_rate, scaled_sample_evtime_orig * CYCLE_UNIT_INV);
		} else {
			amiga_sample_rate	= CHIPSET_CLOCK_NTSC / 124;
			scaled_sample_evtime_orig = 124 * CYCLE_UNIT;	
			BUG.info('Audio.calc_sample_evtime() NTSC mode, rate %f, scaled_sample_evtime %f', amiga_sample_rate, scaled_sample_evtime_orig * CYCLE_UNIT_INV);
		}		
		scaled_sample_evtime = scaled_sample_evtime_orig;
		
		this.filter.setup(AMIGA.config.audio.filter, amiga_sample_rate); /* A500 lowpass-filter */		
	};

	this.setup = function () {
		if (channel === null) {
			channel = [];
			for (var i = 0; i < 4; i++)
				channel[i] = new Channel(i);
		}
		if (!AMIGA.config.audio.enabled || AMIGA.config.audio.mode == SAEV_Config_Audio_Mode_Emul)
			return;

		if (driver.ctx === null) {
			if (this.available & SAEI_Audio_WebAudio)
				driver.ctx = new AudioContext();
		}
		if (driver.ctx === null) {
			if (confirm('Can\'t initialise WebAudio. Continue without audio-playback?')) {
				AMIGA.config.audio.mode = SAEV_Config_Audio_Mode_Emul;
				return;
			} else
				Fatal(SAEE_Audio_WebAudio_Not_Avail, null);
		}
	
		this.calc_sample_evtime(AMIGA.config.video.ntsc ? 60 : 50, 1, AMIGA.config.video.ntsc);

		sampleBuffer.size = SAMPLE_BUFFER_SIZE * 2;
		sampleBuffer.data.left = new Float32Array(sampleBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			sampleBuffer.data.right = new Float32Array(sampleBuffer.size);
		
		resampleBuffer.size = SAMPLE_BUFFER_SIZE * 2;
		resampleBuffer.data.left = new Float32Array(resampleBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			resampleBuffer.data.right = new Float32Array(resampleBuffer.size);
		
		queueBuffer.size = SAMPLE_BUFFER_SIZE * 8;
		queueBuffer.data.left = new Float32Array(queueBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			queueBuffer.data.right = new Float32Array(queueBuffer.size);
		
		outputBuffer.size = SAMPLE_BUFFER_SIZE;
		outputBuffer.data.left = new Float32Array(outputBuffer.size);
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo)
			outputBuffer.data.right = new Float32Array(outputBuffer.size);
		
		if (this.available & SAEI_Audio_WebAudio) {
			if (driver.ctx.createJavaScriptNode)
				driver.node = driver.ctx.createJavaScriptNode(SAMPLE_BUFFER_SIZE, 1, AMIGA.config.audio.channels);
			else if (driver.ctx.createScriptProcessor)
				driver.node = driver.ctx.createScriptProcessor(SAMPLE_BUFFER_SIZE, 1, AMIGA.config.audio.channels);

			if (driver.node) {
				driver.node.onaudioprocess = audioProcess;
				driver.node.connect(driver.ctx.destination);
			}	
		}
	};

	this.cleanup = function () {
		if (driver.ctx !== null) {
			if (this.available & SAEI_Audio_WebAudio) {
				if (driver.node) {
					driver.node.disconnect(driver.ctx.destination);
					driver.node.onaudioprocess = null;
					driver.node = null;
				}
			}	  
		}
	};
		
	this.pauseResume = function (pause) {
		if (!AMIGA.config.audio.enabled || AMIGA.config.audio.mode == SAEV_Config_Audio_Mode_Emul) return;

		if (driver.ctx !== null) {
			if (this.available & SAEI_Audio_WebAudio) {
				if (driver.node) {
					if (pause && !driver.paused) {
						driver.node.disconnect(driver.ctx.destination);
						driver.node.onaudioprocess = null;
						driver.paused = true;
					} else if (!pause && driver.paused) {
						driver.node.onaudioprocess = audioProcess;
						driver.node.connect(driver.ctx.destination);
						driver.paused = false;
					}
				}				
			}
		}
	};

	this.reset = function () {
		for (var i = 0; i < 4; i++)
			channel[i].reset();

		last_cycles = AMIGA.events.currcycle;
		next_sample_evtime = scaled_sample_evtime;
		this.schedule();
		AMIGA.events.schedule();

		work_to_do = 0;
		prevcon = 0;

		sampleBuffer.pos = 0;	
		queueBuffer.usage = 0;
		
		this.filter.reset();
	};
	
	/*---------------------------------*/

	this.event_reset = function () {
		for (var i = 0; i < 4; i++)
			channel[i].zerostate();

		last_cycles = AMIGA.events.currcycle;
		next_sample_evtime = scaled_sample_evtime;
		this.schedule();
		AMIGA.events.schedule();
	};

	this.activate = function () {
		//BUG.info('Audio.activate()');
		var ret = 0;

		if (!work_to_do) {
			this.pauseResume(0);
			ret = 1;
			this.event_reset();
		}
		work_to_do = 4 * AMIGA.playfield.maxvpos_nom * 50;
		return ret;
	};

	this.deactivate = function () {
		//BUG.info('Audio.deactivate()');
		this.pauseResume(1);
		sampleBuffer.pos = 0;
		queueBuffer.usage = 0;		
		this.event_reset();
	};

	this.state_machine = function () {
		this.update();
		for (var i = 0; i < 4; i++)
			channel[i].state_channel(false);

		this.schedule();
		AMIGA.events.schedule();
	};

	this.schedule = function () {
		var best = CYCLE_MAX;

		AMIGA.events.eventtab[EV_AUDIO].active = false;
		AMIGA.events.eventtab[EV_AUDIO].oldcycles = AMIGA.events.currcycle;

		for (var i = 0; i < 4; i++) {
			if (channel[i].evtime != CYCLE_MAX) {
				if (best > channel[i].evtime) {
					best = channel[i].evtime;
					AMIGA.events.eventtab[EV_AUDIO].active = true;
				}
			}
		}
		AMIGA.events.eventtab[EV_AUDIO].evtime = AMIGA.events.currcycle + best;
	};

	this.update = function () {
		if (!AMIGA.config.audio.enabled || !work_to_do) {
			last_cycles = AMIGA.events.currcycle;
			return;
		}

		var n_cycles = AMIGA.events.currcycle - last_cycles;
		while (n_cycles > 0) {
			var best_evtime = n_cycles + 1;
			var i, rounded;

			for (i = 0; i < 4; i++) {
				if (channel[i].evtime != CYCLE_MAX && best_evtime > channel[i].evtime)
					best_evtime = channel[i].evtime;
			}

			rounded = Math.floor(next_sample_evtime);
			if ((next_sample_evtime - rounded) >= 0.5)
				rounded++;

			if (AMIGA.config.audio.mode != SAEV_Config_Audio_Mode_Emul && best_evtime > rounded)
				best_evtime = rounded;

			if (best_evtime > n_cycles)
				best_evtime = n_cycles;

			next_sample_evtime -= best_evtime;

			/*if (AMIGA.config.audio.mode != SAEV_Config_Audio_Mode_Emul) {
			 if (sample_prehandler)
			 sample_prehandler (best_evtime / CYCLE_UNIT);
			 }*/

			for (i = 0; i < 4; i++) {
				if (channel[i].evtime != CYCLE_MAX)
					channel[i].evtime -= best_evtime;
			}
			n_cycles -= best_evtime;

			if (AMIGA.config.audio.mode != SAEV_Config_Audio_Mode_Emul) {
				if (rounded == best_evtime) {
					next_sample_evtime += scaled_sample_evtime;

					this.sample_handler_def();
					//this.sample_handler_crux();
					//this.sample_handler_rh();
				}
			}

			for (i = 0; i < 4; i++) {
				if (channel[i].evtime == 0) {
					channel[i].state_channel(true);
					if (channel[i].evtime == 0) {
						BUG.info('Audio.update() sound bug in channel %d (evtime == 0)', i);
						channel[i].evtime = CYCLE_MAX;
					}
				}
			}
		}
		last_cycles = AMIGA.events.currcycle - n_cycles;
	};

	this.update_adkmasks = function () {
		var t = AMIGA.adkcon | (AMIGA.adkcon >> 4);

		channel[0].enabled = ((t >> 0) & 1) == 0;
		channel[1].enabled = ((t >> 1) & 1) == 0;
		channel[2].enabled = ((t >> 2) & 1) == 0;
		channel[3].enabled = ((t >> 3) & 1) == 0;

		if ((prevcon & 0xff) != (AMIGA.adkcon & 0xff)) {
			this.activate();
			prevcon = AMIGA.adkcon;
		}
	};

	this.handler = function () {
		this.update();
		this.schedule();
	};

	this.hsync = function () {
		if (work_to_do > 0) {
			if (--work_to_do == 0)
				this.deactivate();
		}
		this.update();
	};
	
	this.vsync = function () {
	};
	
	/*---------------------------------*/

	this.AUDxDAT = function (nr, v) {
		//BUG.info('AUD%dDAT %x', nr, v);
		channel[nr].dat = v;
		channel[nr].dat_written = true;
		if (channel[nr].state == 2 || channel[nr].state == 3) {
			var chan_ena = ((AMIGA.dmacon & DMAF_DMAEN) && (AMIGA.dmacon & (1 << nr))) ? true : false;
			if (chan_ena) {
				if (channel[nr].wlen == 1) {
					channel[nr].wlen = channel[nr].len;
					channel[nr].intreq = true;
				} else {
					//channel[nr].wlen = (channel[nr].wlen - 1) & 0xffff;
					if ((--channel[nr].wlen) < 0) channel[nr].wlen = 0xffff;
				}
			}
		} else {
			this.activate();
			this.update();
			channel[nr].state_channel(false);
			this.schedule();
			AMIGA.events.schedule();
		}
		channel[nr].dat_written = false;
	};

	this.AUDxPER = function (nr, v) {
		this.activate();
		this.update();

		var per = v * CYCLE_UNIT;
		if (per == 0)
			per = PERIOD_MAX - 1;

		if (per < PERIOD_MIN * CYCLE_UNIT)
			per = PERIOD_MIN * CYCLE_UNIT;
		if (per < PERIOD_MIN_NONCE * CYCLE_UNIT && channel[nr].dmaenstore)
			per = PERIOD_MIN_NONCE * CYCLE_UNIT;

		if (channel[nr].per == PERIOD_MAX - 1 && per != PERIOD_MAX - 1) {
			channel[nr].evtime = CYCLE_UNIT;
			if (AMIGA.config.audio.enabled) {
				this.schedule();
				AMIGA.events.schedule();
			}
		}
		channel[nr].per = per;
		//if (debugchannel(nr)) BUG.info('AUD%dPER() %x', nr, v);
	};

	this.AUDxLEN = function (nr, v) {
		this.activate();
		this.update();
		channel[nr].len = v;
		//if (debugchannel(nr)) BUG.info('AUD%dLEN() %x', nr, v);
	};

	this.AUDxVOL = function (nr, v) {
		v &= 127;
		if (v > 64) v = 64;
		this.activate();
		this.update();
		channel[nr].vol = v;
		//if (debugchannel(nr)) BUG.info('AUD%dVOL() %x', nr, v);
	};

	this.AUDxLCH = function (nr, v) {
		this.activate();
		this.update();

		if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && ((channel[nr].ptx_tofetch && channel[nr].state == 1) || channel[nr].ptx_written)) {
			channel[nr].ptx = channel[nr].lc;
			channel[nr].ptx_written = true;
		} else
			channel[nr].lc = ((channel[nr].lc & 0xffff) | (v << 16)) >>> 0;
	};

	this.AUDxLCL = function (nr, v) {
		this.activate();
		this.update();

		if (AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Maximum && ((channel[nr].ptx_tofetch && channel[nr].state == 1) || channel[nr].ptx_written)) {
			channel[nr].ptx = channel[nr].lc;
			channel[nr].ptx_written = true;
		} else
			channel[nr].lc = ((channel[nr].lc & ~0xffff) | (v & 0xfffe)) >>> 0;
	};

	/*---------------------------------*/

	this.getpt = function (nr, reset) {
		var p = channel[nr].pt;
		channel[nr].pt += 2;
		if (reset)
			channel[nr].pt = channel[nr].lc;
		channel[nr].ptx_tofetch = false;
		return p;
	};
	  
	this.dmal = function () {
		var dmal = 0;
		for (var nr = 0; nr < 4; nr++) {
			if (channel[nr].dr)
				dmal |= (1 << (nr * 2));
			if (channel[nr].dsr)
				dmal |= (1 << (nr * 2 + 1));
			channel[nr].dr = channel[nr].dsr = false;
		}
		//if (dmal) BUG.info('Audio.dmal() %d', dmal);
		return dmal;
	};
	
	/*---------------------------------*/
		
	const inv32768 = 1.0 / 32768;		

	this.sample_handler_def = function () {
		var data0 = channel[0].enabled ? (channel[0].current_sample * channel[0].vol) : 0;
		var data1 = channel[1].enabled ? (channel[1].current_sample * channel[1].vol) : 0;
		var data2 = channel[2].enabled ? (channel[2].current_sample * channel[2].vol) : 0;
		var data3 = channel[3].enabled ? (channel[3].current_sample * channel[3].vol) : 0;

		data0 += data3;
		data1 += data2;
		data2 = data0 << 1;
		data3 = data1 << 1;
		if (AMIGA.config.audio.filter) {
			data2 = this.filter.filter(data2, 0);
			data3 = this.filter.filter(data3, 1);
		}
		
		if (sampleBuffer.pos < sampleBuffer.size) {
			if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
				sampleBuffer.data.left[sampleBuffer.pos] = inv32768 * data2;
				sampleBuffer.data.right[sampleBuffer.pos] = inv32768 * data3;
				sampleBuffer.pos++;
			} else
				sampleBuffer.data.left[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
		} //else
			//BUG.info('Audio.sample_handler() audio buffer over-run!');
	};
	
	this.sample_handler_crux = function () {
		var data0 = channel[0].enabled ? (channel[0].current_sample * channel[0].vol) : 0;
		var data1 = channel[1].enabled ? (channel[1].current_sample * channel[1].vol) : 0;
		var data2 = channel[2].enabled ? (channel[2].current_sample * channel[2].vol) : 0;
		var data3 = channel[3].enabled ? (channel[3].current_sample * channel[3].vol) : 0;

		var data0p = channel[0].enabled ? (channel[0].last_sample * channel[0].vol) : 0;
		var data1p = channel[1].enabled ? (channel[1].last_sample * channel[1].vol) : 0;
		var data2p = channel[2].enabled ? (channel[2].last_sample * channel[2].vol) : 0;
		var data3p = channel[3].enabled ? (channel[3].last_sample * channel[3].vol) : 0;

		{
			const INTERVAL = scaled_sample_evtime * 3;
			var ratio, ratio1;

			ratio1 = channel[0].per - channel[0].evtime;
			ratio = Math.floor((ratio1 << 12) / INTERVAL);
			if (channel[0].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data0 = (data0 * ratio + data0p * (4096 - ratio)) >> 12;

			ratio1 = channel[1].per - channel[1].evtime;
			ratio = Math.floor((ratio1 << 12) / INTERVAL);
			if (channel[1].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data1 = (data1 * ratio + data1p * (4096 - ratio)) >> 12;

			ratio1 = channel[2].per - channel[2].evtime;
			ratio = Math.floor((ratio1 << 12) / INTERVAL);
			if (channel[2].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data2 = (data2 * ratio + data2p * (4096 - ratio)) >> 12;

			ratio1 = channel[3].per - channel[3].evtime;
			ratio = Math.floor((ratio1 << 12) / INTERVAL);
			if (channel[3].evtime < scaled_sample_evtime || ratio1 >= INTERVAL)
				ratio = 4096;
			data3 = (data3 * ratio + data3p * (4096 - ratio)) >> 12;
		}
		data0 += data3;
		data1 += data2;
		data2 = data0 << 1;
		data3 = data1 << 1;
		if (AMIGA.config.audio.filter) {
			data2 = this.filter.filter(data2, 0);
			data3 = this.filter.filter(data3, 1);
		}

		if (sampleBuffer.pos < sampleBuffer.size) {
			if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
				sampleBuffer.data.left[sampleBuffer.pos] = inv32768 * data2;
				sampleBuffer.data.right[sampleBuffer.pos] = inv32768 * data3;
				sampleBuffer.pos++;
			} else
				sampleBuffer.data.left[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
		} //else
			//BUG.info('Audio.sample_handler_crux() audio buffer over-run!');
	};

	this.sample_handler_rh = function () {
		var data0 = channel[0].enabled ? (channel[0].current_sample * channel[0].vol) : 0;
		var data1 = channel[1].enabled ? (channel[1].current_sample * channel[1].vol) : 0;
		var data2 = channel[2].enabled ? (channel[2].current_sample * channel[2].vol) : 0;
		var data3 = channel[3].enabled ? (channel[3].current_sample * channel[3].vol) : 0;
		var data0p = channel[0].enabled ? (channel[0].last_sample * channel[0].vol) : 0;
		var data1p = channel[1].enabled ? (channel[1].last_sample * channel[1].vol) : 0;
		var data2p = channel[2].enabled ? (channel[2].last_sample * channel[2].vol) : 0;
		var data3p = channel[3].enabled ? (channel[3].last_sample * channel[3].vol) : 0;

		{
			var delta, ratio;

			delta = channel[0].per;
			ratio = Math.floor(((channel[0].evtime % delta) << 8) / delta);
			data0 = (data0 * (256 - ratio) + data0p * ratio) >> 8;
			delta = channel[1].per;
			ratio = Math.floor(((channel[1].evtime % delta) << 8) / delta);
			data1 = (data1 * (256 - ratio) + data1p * ratio) >> 8;
			delta = channel[2].per;
			ratio = Math.floor(((channel[2].evtime % delta) << 8) / delta);
			data1 += (data2 * (256 - ratio) + data2p * ratio) >> 8;
			delta = channel[3].per;
			ratio = Math.floor(((channel[3].evtime % delta) << 8) / delta);
			data0 += (data3 * (256 - ratio) + data3p * ratio) >> 8;
		}

		data2 = data0 << 1;
		data3 = data1 << 1;
		if (AMIGA.config.audio.filter) {
			data2 = this.filter.filter(data2, 0);
			data3 = this.filter.filter(data3, 1);
		}

		if (sampleBuffer.pos < sampleBuffer.size) {
			if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
				sampleBuffer.data.left[sampleBuffer.pos] = inv32768 * data2;
				sampleBuffer.data.right[sampleBuffer.pos] = inv32768 * data3;
				sampleBuffer.pos++;
			} else
				sampleBuffer.data.left[sampleBuffer.pos++] = inv32768 * ((data2 + data3) * 0.5);
		} //else
			//BUG.info('Audio.sample_handler_rh() audio buffer over-run!');
	};
	
	/*---------------------------------*/
	
	function queuePush() {	
		if (queueBuffer.usage + resampleBuffer.len >= queueBuffer.size) 		
			return;
	
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0; i < resampleBuffer.len; i++) {
				queueBuffer.data.left[queueBuffer.usage + i] = resampleBuffer.data.left[i];
				queueBuffer.data.right[queueBuffer.usage + i] = resampleBuffer.data.right[i];
			}
		} else {
			for (var i = 0; i < resampleBuffer.len; i++)
				queueBuffer.data.left[queueBuffer.usage + i] = resampleBuffer.data.left[i];
		}
		queueBuffer.usage += resampleBuffer.len;
		if (queueBuffer.usage > SAMPLE_BUFFER_SIZE * 4)
			queueBuffer.usage = 0;			
	}
	
	function queuePop(bytes) {			
		if (queueBuffer.usage - bytes < 0)
			bytes = queueBuffer.usage;
		if (bytes <= 0) {
			outputBuffer.len = 0;
			return;
		}
	
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0; i < bytes; i++) {
				outputBuffer.data.left[i] = queueBuffer.data.left[i];
				outputBuffer.data.right[i] = queueBuffer.data.right[i];
			}
		} else {
			for (var i = 0; i < bytes; i++)
				outputBuffer.data.left[i] = queueBuffer.data.left[i];
		}
		outputBuffer.len = bytes;

		queueBuffer.usage -= bytes;
		
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			for (var i = 0; i < queueBuffer.usage; i++) {
				queueBuffer.data.left[i] = queueBuffer.data.left[bytes + i];
				queueBuffer.data.right[i] = queueBuffer.data.right[bytes + i];
			}			
		} else {			
			for (var i = 0; i < queueBuffer.usage; i++)
				queueBuffer.data.left[i] = queueBuffer.data.left[bytes + i];
		}			
	}
	
	function resample() {
		var step = amiga_sample_rate / driver.ctx.sampleRate;			
		
		resampleBuffer.len = Math.floor(sampleBuffer.pos / step);

		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {		
			for (var i = 0, j = 0.0; i < resampleBuffer.len; i++, j += step) {
				resampleBuffer.data.left[i] = sampleBuffer.data.left[j >> 0];
				resampleBuffer.data.right[i] = sampleBuffer.data.right[j >> 0];
			}			
		} else {
			for (var i = 0, j = 0.0; i < resampleBuffer.len; i++, j += step)
				resampleBuffer.data.left[i] = sampleBuffer.data.left[j >> 0];
		}		
		sampleBuffer.pos = 0;		
	}	
	
	function audioProcess(e) {			
		if (sampleBuffer.pos == 0)
				return;
			
		//var _pos = sampleBuffer.pos;

		resample();

		queuePush();
		queuePop(SAMPLE_BUFFER_SIZE);

		//console.log(_pos, resampleBuffer.len, queueBuffer.usage, outputBuffer.len);
	
		if (outputBuffer.len == 0)
			return;

		var step = outputBuffer.len / SAMPLE_BUFFER_SIZE;	
		
		if (AMIGA.config.audio.channels == SAEV_Config_Audio_Channels_Stereo) {
			var data1 = e.outputBuffer.getChannelData(0);
			var data2 = e.outputBuffer.getChannelData(1);
		
			for (var i = 0, j = 0.0; i <  SAMPLE_BUFFER_SIZE; i++, j += step) {
				data1[i] = outputBuffer.data.left[j >> 0];
				data2[i] = outputBuffer.data.right[j >> 0];
			}
		} else {
			var data = e.outputBuffer.getChannelData(0);
			
			for (var i = 0, j = 0.0; i < SAMPLE_BUFFER_SIZE; i++, j += step)
				data[i] = outputBuffer.data.left[j >> 0];
		}
	}	
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

function Blitter() {	
	const FAST = true;
	const BLITTER_MAX_WORDS = 2048;

	const blit_cycle_diagram = [
		[2, 0,0,     0,0    ], /* 0   -- */
		[2, 0,0,     0,4    ], /* 1   -D */
		[2, 0,3,     0,3    ], /* 2   -C */
		[3, 0,3,0,   0,3,4  ], /* 3  -CD */
		[3, 0,2,0,   0,2,0  ], /* 4  -B- */
		[3, 0,2,0,   0,2,4  ], /* 5  -BD */
		[3, 0,2,3,   0,2,3  ], /* 6  -BC */
		[4, 0,2,3,0, 0,2,3,4], /* 7 -BCD */
		[2, 1,0,     1,0    ], /* 8   A- */
		[2, 1,0,     1,4    ], /* 9   AD */
		[2, 1,3,	    1,3    ], /* A   AC */
		[3, 1,3,0,   1,3,4  ], /* B  ACD */
		[3, 1,2,0,   1,2,0  ], /* C  AB- */
		[3, 1,2,0,   1,2,4  ], /* D  ABD */
		[3, 1,2,3,   1,2,3  ], /* E  ABC */
		[4, 1,2,3,0, 1,2,3,4]  /* F ABCD */
	];
	const blit_cycle_diagram_fill = [
		[0                  ], /* 0 */
		[3, 0,0,0,   0,4,0  ], /* 1 */
		[0                  ], /* 2 */
		[0                  ], /* 3 */
		[0                  ], /* 4 */
		[4, 0,2,0,0, 0,2,4,0], /* 5 */
		[0                  ], /* 6 */
		[0                  ], /* 7 */
		[0                  ], /* 8 */
		[3, 1,0,0,   1,4,0  ], /* 9 */
		[0                  ], /* A */
		[0                  ], /* B */
		[0                  ], /* C */
		[4, 1,2,0,0, 1,2,4,0], /* D */
		[0                  ], /* E */
		[0                  ]  /* F */
	];
	const blit_cycle_diagram_line = [4, 0,3,5,4, 0,3,5,4];
	//const blit_cycle_diagram_finald = [2, 0,4, 0,4];
	//const blit_cycle_diagram_finalld = [2, 0,0, 0,0];
	
	var blit_filltable = [];
	var blit_masktable = [];
	var blit_interrupt = true;
	var blit_ch = 0;
	var blit_slowdown = 0;
	var blit_stuck = 0;
	var blit_cyclecounter = 0;
	var blit_firstline_cycles = 0;
	var blit_first_cycle = 0;
	var blit_last_cycle = 0, blit_dmacount = 0, blit_dmacount2 = 0;	
	var blit_nod = 0;
	var blit_diag = [];
	var blit_faulty = 0;
	var original_ch = 0, original_fill = 0, original_line = 0;	
	
 	var bltstate = BLT_done;

	var bltcon0 = 0;
	var bltcon1 = 0;
	var bltapt = 0;
	var bltapt_line = null;
	var bltbpt = 0;
	var bltcpt = 0;	
	var bltdpt = 0;	

	var blinea_shift = 0;
	var blinea = 0, blineb = 0;
	var blitline = 0, blitfc = 0, blitfill = 0, blitife = 0, blitsing = 0, blitdesc = 0;
	var blitonedot = 0, blitsign = 0, blitlinepixel = 0;

	var ddat1use = 0, ddat2use = 0;
	var last_blitter_hpos = 0;
	
	var blt_info = {	
		blitzero:0,
		blitashift:0, blitbshift:0, blitdownashift:0, blitdownbshift:0,
		bltadat:0, bltbdat:0, bltcdat:0, bltddat:0,
		bltahold:0, bltbhold:0, bltafwm:0, bltalwm:0,
		vblitsize:0, hblitsize:0,
		bltamod:0, bltbmod:0, bltcmod:0, bltdmod:0,
		got_cycle:0
	};

	//function build_blitfilltable()
	{
		blit_masktable = new Uint16Array(BLITTER_MAX_WORDS);
		for (var i = 0; i < BLITTER_MAX_WORDS; i++)
			blit_masktable[i] = 0xffff;

		blit_filltable = [];
		for (var d = 0; d < 256; d++) {
			blit_filltable[d] = [];
			for (var i = 0; i < 4; i++) {
				var fc = (i & 1) == 1;
				var data = d;
				blit_filltable[d][i] = [];				
				for (var fillmask = 1; fillmask != 0x100; fillmask <<= 1) {
					var tmp = data;
					if (fc) {
						if (i & 2)
							data |= fillmask;
						else
							data ^= fillmask;
					}
					if (tmp & fillmask) fc = !fc;
				}
				blit_filltable[d][i][0] = data;
				blit_filltable[d][i][1] = fc;
			}
		}
	}

	/*---------------------------------*/

	this.reset = function () {
		bltstate = BLT_done;
		blit_interrupt = true;
		blit_stuck = 0;
	};

	/*function blitter_dump() {
		BUG.info('PT A=%08X B=%08X C=%08X D=%08X', bltapt, bltbpt, bltcpt, bltdpt);
		BUG.info('CON0=%04X CON1=%04X DAT A=%04X B=%04X C=%04X', bltcon0, bltcon1, blt_info.bltadat, blt_info.bltbdat, blt_info.bltcdat);
		//BUG.info('AFWM=%04X ALWM=%04X MOD A=%04X B=%04X C=%04X D=%04X', blt_info.bltafwm, blt_info.bltalwm, blt_info.bltamod & 0xffff, blt_info.bltbmod & 0xffff, blt_info.bltcmod & 0xffff, blt_info.bltdmod & 0xffff);
		BUG.info('AFWM=%04X ALWM=%04X MOD A=%04X B=%04X C=%04X D=%04X', blt_info.bltafwm, blt_info.bltalwm, blt_info.bltamod, blt_info.bltbmod, blt_info.bltcmod, blt_info.bltdmod);
	}*/

	function castWord(v) {
		return (v & 0x8000) ? (v - 0x10000) : v;
	}

	function get_ch() {
		if (blit_faulty) {
			console.log('get_ch() blit_faulty');			
			return blit_cycle_diagram[0]; //&blit_diag[0];
		} 
		return blit_diag;
	}

	function channel_state(cycles) {
		//console.log('channel_state()', cycles);
		if (cycles < 0)
			return 0;
		var diag = get_ch();
		if (cycles < diag[0])
			return diag[1 + cycles];
		cycles -= diag[0];
		cycles %= diag[0];
		return diag[1 + diag[0] + cycles];
	}
	
	/*function channel_pos(cycles) {
		if (cycles < 0)
			return 0;
		var diag = get_ch();
		if (cycles < diag[0])
			return cycles;
		cycles -= diag[0];
		cycles %= diag[0];
		return cycles;
	}*/

	function blitter_interrupt() {
		if (blit_interrupt)
			return;
		blit_interrupt = true;
		AMIGA.INTREQ_0(INT_BLIT);
	}

	function blitter_done(hpos) {
		ddat1use = ddat2use = 0;
		bltstate = BLT_done;
		blitter_interrupt();
		AMIGA.copper.blitter_done_notify(hpos);
		AMIGA.events.remevent(EV2_BLITTER);
		clr_special(SPCFLAG_BLTNASTY);
	}
	
	/*---------------------------------*/
	/* ~1500 lines of auto-generated functions are follwing... */
	/*---------------------------------*/
			
	function blitdofast_0(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (0) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptd) ptd += b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_0(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (0) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptd) ptd -= b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((~srca & srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((~srca & srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_2a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & ~(srca & srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_2a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & ~(srca & srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_30(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca & ~srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_30(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca & ~srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_3a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb ^ (srca | (srcb ^ srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_3a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb ^ (srca | (srcb ^ srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_3c(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_3c(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_4a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb | srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_4a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb | srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_6a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_6a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_8a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (~srca | srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_8a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (~srca | srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_8c(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb & (~srca | srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_8c(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcb & (~srca | srcc))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_9a(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & ~srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_9a(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & ~srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_a8(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (srca | srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_a8(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc & (srca | srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_aa(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_aa(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcc) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_b1(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (~(srca ^ (srcc | (srca ^ srcb)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_b1(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (~(srca ^ (srcc | (srca ^ srcb)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_ca(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb ^ srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_ca(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srca & (srcb ^ srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_cc(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_cc(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srcb) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_d8(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ (srcc & (srca ^ srcb)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_d8(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca ^ (srcc & (srca ^ srcb)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_e2(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srcb & (srca ^ srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_e2(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc ^ (srcb & (srca ^ srcc)))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_ea(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc | (srca & srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_ea(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srcc | (srca & srcb))) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_f0(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srca) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptd) ptd += b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_f0(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = (srca) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptd) ptd -= b.bltdmod;
		}
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_fa(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc += 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptc) ptc += b.bltcmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_fa(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var srcc = b.bltcdat;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptc) { srcc = AMIGA.mem.chip.data[ptc >>> 1]; ptc -= 2; }
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcc)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptc) ptc -= b.bltcmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltcdat = srcc;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_fc(pta, ptb, ptc, ptd, b) {
		var i,j;
		var totald = 0;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;

				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb += 2;
					srcb = ((((prevb << 16) | bltbdat) >>> 0) >>> b.blitbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta += 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((preva << 16) | bltadat) >>> 0) >>> b.blitashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd += 2; }
			}
			if (pta) pta += b.bltamod;
			if (ptb) ptb += b.bltbmod;
			if (ptd) ptd += b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	function blitdofast_desc_fc(pta, ptb, ptc, ptd, b) {
		var totald = 0;
		var i,j;
		var preva = 0;
		var prevb = 0, srcb = b.bltbhold;
		var dstd = 0;
		var dstp = 0;
		for (j = 0; j < b.vblitsize; j++) {
			for (i = 0; i < b.hblitsize; i++) {
				var bltadat, srca;
				if (ptb) {
					var bltbdat = blt_info.bltbdat = AMIGA.mem.chip.data[ptb >>> 1]; ptb -= 2;
					srcb = ((((bltbdat << 16) | prevb) >>> 0) >>> b.blitdownbshift) & 0xffff;
					prevb = bltbdat;
				}
				if (pta) { bltadat = blt_info.bltadat = AMIGA.mem.chip.data[pta >>> 1]; pta -= 2; } else { bltadat = blt_info.bltadat; }
				bltadat &= blit_masktable[i];
				srca = ((((bltadat << 16) | preva) >>> 0) >>> b.blitdownashift) & 0xffff;
				preva = bltadat;
				if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
				dstd = ((srca | srcb)) & 0xffff;
				totald |= dstd;
				if (ptd) { dstp = ptd; ptd -= 2; }
			}
			if (pta) pta -= b.bltamod;
			if (ptb) ptb -= b.bltbmod;
			if (ptd) ptd -= b.bltdmod;
		}
		b.bltbhold = srcb;
		if (dstp) AMIGA.mem.chip.data[dstp >>> 1] = dstd;
		if (totald != 0) b.blitzero = 0;
	}

	const blitfunc_dofast = [
		blitdofast_0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_2a, 0, 0, 0, 0, 0, 
		blitdofast_30, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_3a, 0, blitdofast_3c, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_4a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_6a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_8a, 0, blitdofast_8c, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_9a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		blitdofast_a8, 0, blitdofast_aa, 0, 0, 0, 0, 0, 
		0, blitdofast_b1, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_ca, 0, blitdofast_cc, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		blitdofast_d8, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_e2, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_ea, 0, 0, 0, 0, 0, 
		blitdofast_f0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_fa, 0, blitdofast_fc, 0, 0, 0
	];

	const blitfunc_dofast_desc = [
		blitdofast_desc_0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_2a, 0, 0, 0, 0, 0, 
		blitdofast_desc_30, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_3a, 0, blitdofast_desc_3c, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_4a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_6a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_8a, 0, blitdofast_desc_8c, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_9a, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		blitdofast_desc_a8, 0, blitdofast_desc_aa, 0, 0, 0, 0, 0, 
		0, blitdofast_desc_b1, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_ca, 0, blitdofast_desc_cc, 0, 0, 0, 
		0, 0, 0, 0, 0, 0, 0, 0, 
		blitdofast_desc_d8, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_e2, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_ea, 0, 0, 0, 0, 0, 
		blitdofast_desc_f0, 0, 0, 0, 0, 0, 0, 0, 
		0, 0, blitdofast_desc_fa, 0, blitdofast_desc_fc, 0, 0, 0
	];

	function blit_func(a, b, c, mt) {
		switch (mt) {
			case 0x00: return 0;
			case 0x01: return (~c & ~b & ~a);
			case 0x02: return (c & ~b & ~a);
			case 0x03: return (~b & ~a);
			case 0x04: return (~c & b & ~a);
			case 0x05: return (~c & ~a);
			case 0x06: return (c & ~b & ~a) | (~c & b & ~a);
			case 0x07: return (~b & ~a) | (~c & ~a);
			case 0x08: return (c & b & ~a);
			case 0x09: return (~c & ~b & ~a) | (c & b & ~a);
			case 0x0a: return (c & ~a);
			case 0x0b: return (~b & ~a) | (c & ~a);
			case 0x0c: return (b & ~a);
			case 0x0d: return (~c & ~a) | (b & ~a);
			case 0x0e: return (c & ~a) | (b & ~a);
			case 0x0f: return (~a);
			case 0x10: return (~c & ~b & a);
			case 0x11: return (~c & ~b);
			case 0x12: return (c & ~b & ~a) | (~c & ~b & a);
			case 0x13: return (~b & ~a) | (~c & ~b);
			case 0x14: return (~c & b & ~a) | (~c & ~b & a);
			case 0x15: return (~c & ~a) | (~c & ~b);
			case 0x16: return (c & ~b & ~a) | (~c & b & ~a) | (~c & ~b & a);
			case 0x17: return (~b & ~a) | (~c & ~a) | (~c & ~b);
			case 0x18: return (c & b & ~a) | (~c & ~b & a);
			case 0x19: return (~c & ~b) | (c & b & ~a);
			case 0x1a: return (c & ~a) | (~c & ~b & a);
			case 0x1b: return (~b & ~a) | (c & ~a) | (~c & ~b);
			case 0x1c: return (b & ~a) | (~c & ~b & a);
			case 0x1d: return (~c & ~a) | (b & ~a) | (~c & ~b);
			case 0x1e: return (c & ~a) | (b & ~a) | (~c & ~b & a);
			case 0x1f: return (~a) | (~c & ~b);
			case 0x20: return (c & ~b & a);
			case 0x21: return (~c & ~b & ~a) | (c & ~b & a);
			case 0x22: return (c & ~b);
			case 0x23: return (~b & ~a) | (c & ~b);
			case 0x24: return (~c & b & ~a) | (c & ~b & a);
			case 0x25: return (~c & ~a) | (c & ~b & a);
			case 0x26: return (c & ~b) | (~c & b & ~a);
			case 0x27: return (~b & ~a) | (~c & ~a) | (c & ~b);
			case 0x28: return (c & b & ~a) | (c & ~b & a);
			case 0x29: return (~c & ~b & ~a) | (c & b & ~a) | (c & ~b & a);
			case 0x2a: return (c & ~a) | (c & ~b);
			case 0x2b: return (~b & ~a) | (c & ~a) | (c & ~b);
			case 0x2c: return (b & ~a) | (c & ~b & a);
			case 0x2d: return (~c & ~a) | (b & ~a) | (c & ~b & a);
			case 0x2e: return (c & ~a) | (b & ~a) | (c & ~b);
			case 0x2f: return (~a) | (c & ~b);
			case 0x30: return (~b & a);
			case 0x31: return (~c & ~b) | (~b & a);
			case 0x32: return (c & ~b) | (~b & a);
			case 0x33: return (~b);
			case 0x34: return (~c & b & ~a) | (~b & a);
			case 0x35: return (~c & ~a) | (~b & a);
			case 0x36: return (c & ~b) | (~c & b & ~a) | (~b & a);
			case 0x37: return (~b) | (~c & ~a);
			case 0x38: return (c & b & ~a) | (~b & a);
			case 0x39: return (~c & ~b) | (c & b & ~a) | (~b & a);
			case 0x3a: return (c & ~a) | (~b & a);
			case 0x3b: return (~b) | (c & ~a);
			case 0x3c: return (b & ~a) | (~b & a);
			case 0x3d: return (~c & ~a) | (b & ~a) | (~b & a);
			case 0x3e: return (c & ~a) | (b & ~a) | (~b & a);
			case 0x3f: return (~a) | (~b);
			case 0x40: return (~c & b & a);
			case 0x41: return (~c & ~b & ~a) | (~c & b & a);
			case 0x42: return (c & ~b & ~a) | (~c & b & a);
			case 0x43: return (~b & ~a) | (~c & b & a);
			case 0x44: return (~c & b);
			case 0x45: return (~c & ~a) | (~c & b);
			case 0x46: return (c & ~b & ~a) | (~c & b);
			case 0x47: return (~b & ~a) | (~c & ~a) | (~c & b);
			case 0x48: return (c & b & ~a) | (~c & b & a);
			case 0x49: return (~c & ~b & ~a) | (c & b & ~a) | (~c & b & a);
			case 0x4a: return (c & ~a) | (~c & b & a);
			case 0x4b: return (~b & ~a) | (c & ~a) | (~c & b & a);
			case 0x4c: return (b & ~a) | (~c & b);
			case 0x4d: return (~c & ~a) | (b & ~a) | (~c & b);
			case 0x4e: return (c & ~a) | (b & ~a) | (~c & b);
			case 0x4f: return (~a) | (~c & b);
			case 0x50: return (~c & a);
			case 0x51: return (~c & ~b) | (~c & a);
			case 0x52: return (c & ~b & ~a) | (~c & a);
			case 0x53: return (~b & ~a) | (~c & a);
			case 0x54: return (~c & b) | (~c & a);
			case 0x55: return (~c);
			case 0x56: return (c & ~b & ~a) | (~c & b) | (~c & a);
			case 0x57: return (~b & ~a) | (~c);
			case 0x58: return (c & b & ~a) | (~c & a);
			case 0x59: return (~c & ~b) | (c & b & ~a) | (~c & a);
			case 0x5a: return (c & ~a) | (~c & a);
			case 0x5b: return (~b & ~a) | (c & ~a) | (~c & a);
			case 0x5c: return (b & ~a) | (~c & a);
			case 0x5d: return (~c) | (b & ~a);
			case 0x5e: return (c & ~a) | (b & ~a) | (~c & a);
			case 0x5f: return (~a) | (~c);
			case 0x60: return (c & ~b & a) | (~c & b & a);
			case 0x61: return (~c & ~b & ~a) | (c & ~b & a) | (~c & b & a);
			case 0x62: return (c & ~b) | (~c & b & a);
			case 0x63: return (~b & ~a) | (c & ~b) | (~c & b & a);
			case 0x64: return (~c & b) | (c & ~b & a);
			case 0x65: return (~c & ~a) | (c & ~b & a) | (~c & b);
			case 0x66: return (c & ~b) | (~c & b);
			case 0x67: return (~b & ~a) | (~c & ~a) | (c & ~b) | (~c & b);
			case 0x68: return (c & b & ~a) | (c & ~b & a) | (~c & b & a);
			case 0x69: return (~c & ~b & ~a) | (c & b & ~a) | (c & ~b & a) | (~c & b & a);
			case 0x6a: return (c & ~a) | (c & ~b) | (~c & b & a);
			case 0x6b: return (~b & ~a) | (c & ~a) | (c & ~b) | (~c & b & a);
			case 0x6c: return (b & ~a) | (c & ~b & a) | (~c & b);
			case 0x6d: return (~c & ~a) | (b & ~a) | (c & ~b & a) | (~c & b);
			case 0x6e: return (c & ~a) | (b & ~a) | (c & ~b) | (~c & b);
			case 0x6f: return (~a) | (c & ~b) | (~c & b);
			case 0x70: return (~b & a) | (~c & a);
			case 0x71: return (~c & ~b) | (~b & a) | (~c & a);
			case 0x72: return (c & ~b) | (~b & a) | (~c & a);
			case 0x73: return (~b) | (~c & a);
			case 0x74: return (~c & b) | (~b & a);
			case 0x75: return (~c) | (~b & a);
			case 0x76: return (c & ~b) | (~c & b) | (~b & a);
			case 0x77: return (~b) | (~c);
			case 0x78: return (c & b & ~a) | (~b & a) | (~c & a);
			case 0x79: return (~c & ~b) | (c & b & ~a) | (~b & a) | (~c & a);
			case 0x7a: return (c & ~a) | (~b & a) | (~c & a);
			case 0x7b: return (~b) | (c & ~a) | (~c & a);
			case 0x7c: return (b & ~a) | (~b & a) | (~c & a);
			case 0x7d: return (~c) | (b & ~a) | (~b & a);
			case 0x7e: return (c & ~a) | (b & ~a) | (~b & a) | (~c & a);
			case 0x7f: return (~a) | (~b) | (~c);
			case 0x80: return (c & b & a);
			case 0x81: return (~c & ~b & ~a) | (c & b & a);
			case 0x82: return (c & ~b & ~a) | (c & b & a);
			case 0x83: return (~b & ~a) | (c & b & a);
			case 0x84: return (~c & b & ~a) | (c & b & a);
			case 0x85: return (~c & ~a) | (c & b & a);
			case 0x86: return (c & ~b & ~a) | (~c & b & ~a) | (c & b & a);
			case 0x87: return (~b & ~a) | (~c & ~a) | (c & b & a);
			case 0x88: return (c & b);
			case 0x89: return (~c & ~b & ~a) | (c & b);
			case 0x8a: return (c & ~a) | (c & b);
			case 0x8b: return (~b & ~a) | (c & ~a) | (c & b);
			case 0x8c: return (b & ~a) | (c & b);
			case 0x8d: return (~c & ~a) | (b & ~a) | (c & b);
			case 0x8e: return (c & ~a) | (b & ~a) | (c & b);
			case 0x8f: return (~a) | (c & b);
			case 0x90: return (~c & ~b & a) | (c & b & a);
			case 0x91: return (~c & ~b) | (c & b & a);
			case 0x92: return (c & ~b & ~a) | (~c & ~b & a) | (c & b & a);
			case 0x93: return (~b & ~a) | (~c & ~b) | (c & b & a);
			case 0x94: return (~c & b & ~a) | (~c & ~b & a) | (c & b & a);
			case 0x95: return (~c & ~a) | (~c & ~b) | (c & b & a);
			case 0x96: return (c & ~b & ~a) | (~c & b & ~a) | (~c & ~b & a) | (c & b & a);
			case 0x97: return (~b & ~a) | (~c & ~a) | (~c & ~b) | (c & b & a);
			case 0x98: return (c & b) | (~c & ~b & a);
			case 0x99: return (~c & ~b) | (c & b);
			case 0x9a: return (c & ~a) | (~c & ~b & a) | (c & b);
			case 0x9b: return (~b & ~a) | (c & ~a) | (~c & ~b) | (c & b);
			case 0x9c: return (b & ~a) | (~c & ~b & a) | (c & b);
			case 0x9d: return (~c & ~a) | (b & ~a) | (~c & ~b) | (c & b);
			case 0x9e: return (c & ~a) | (b & ~a) | (~c & ~b & a) | (c & b);
			case 0x9f: return (~a) | (~c & ~b) | (c & b);
			case 0xa0: return (c & a);
			case 0xa1: return (~c & ~b & ~a) | (c & a);
			case 0xa2: return (c & ~b) | (c & a);
			case 0xa3: return (~b & ~a) | (c & a);
			case 0xa4: return (~c & b & ~a) | (c & a);
			case 0xa5: return (~c & ~a) | (c & a);
			case 0xa6: return (c & ~b) | (~c & b & ~a) | (c & a);
			case 0xa7: return (~b & ~a) | (~c & ~a) | (c & a);
			case 0xa8: return (c & b) | (c & a);
			case 0xa9: return (~c & ~b & ~a) | (c & b) | (c & a);
			case 0xaa: return (c);
			case 0xab: return (~b & ~a) | (c);
			case 0xac: return (b & ~a) | (c & a);
			case 0xad: return (~c & ~a) | (b & ~a) | (c & a);
			case 0xae: return (c) | (b & ~a);
			case 0xaf: return (~a) | (c);
			case 0xb0: return (~b & a) | (c & a);
			case 0xb1: return (~c & ~b) | (~b & a) | (c & a);
			case 0xb2: return (c & ~b) | (~b & a) | (c & a);
			case 0xb3: return (~b) | (c & a);
			case 0xb4: return (~c & b & ~a) | (~b & a) | (c & a);
			case 0xb5: return (~c & ~a) | (~b & a) | (c & a);
			case 0xb6: return (c & ~b) | (~c & b & ~a) | (~b & a) | (c & a);
			case 0xb7: return (~b) | (~c & ~a) | (c & a);
			case 0xb8: return (c & b) | (~b & a);
			case 0xb9: return (~c & ~b) | (c & b) | (~b & a);
			case 0xba: return (c) | (~b & a);
			case 0xbb: return (~b) | (c);
			case 0xbc: return (b & ~a) | (~b & a) | (c & a);
			case 0xbd: return (~c & ~a) | (b & ~a) | (~b & a) | (c & a);
			case 0xbe: return (c) | (b & ~a) | (~b & a);
			case 0xbf: return (~a) | (~b) | (c);
			case 0xc0: return (b & a);
			case 0xc1: return (~c & ~b & ~a) | (b & a);
			case 0xc2: return (c & ~b & ~a) | (b & a);
			case 0xc3: return (~b & ~a) | (b & a);
			case 0xc4: return (~c & b) | (b & a);
			case 0xc5: return (~c & ~a) | (b & a);
			case 0xc6: return (c & ~b & ~a) | (~c & b) | (b & a);
			case 0xc7: return (~b & ~a) | (~c & ~a) | (b & a);
			case 0xc8: return (c & b) | (b & a);
			case 0xc9: return (~c & ~b & ~a) | (c & b) | (b & a);
			case 0xca: return (c & ~a) | (b & a);
			case 0xcb: return (~b & ~a) | (c & ~a) | (b & a);
			case 0xcc: return (b);
			case 0xcd: return (~c & ~a) | (b);
			case 0xce: return (c & ~a) | (b);
			case 0xcf: return (~a) | (b);
			case 0xd0: return (~c & a) | (b & a);
			case 0xd1: return (~c & ~b) | (b & a);
			case 0xd2: return (c & ~b & ~a) | (~c & a) | (b & a);
			case 0xd3: return (~b & ~a) | (~c & a) | (b & a);
			case 0xd4: return (~c & b) | (~c & a) | (b & a);
			case 0xd5: return (~c) | (b & a);
			case 0xd6: return (c & ~b & ~a) | (~c & b) | (~c & a) | (b & a);
			case 0xd7: return (~b & ~a) | (~c) | (b & a);
			case 0xd8: return (c & b) | (~c & a);
			case 0xd9: return (~c & ~b) | (c & b) | (b & a);
			case 0xda: return (c & ~a) | (~c & a) | (b & a);
			case 0xdb: return (~b & ~a) | (c & ~a) | (~c & a) | (b & a);
			case 0xdc: return (b) | (~c & a);
			case 0xdd: return (~c) | (b);
			case 0xde: return (c & ~a) | (b) | (~c & a);
			case 0xdf: return (~a) | (~c) | (b);
			case 0xe0: return (c & a) | (b & a);
			case 0xe1: return (~c & ~b & ~a) | (c & a) | (b & a);
			case 0xe2: return (c & ~b) | (b & a);
			case 0xe3: return (~b & ~a) | (c & a) | (b & a);
			case 0xe4: return (~c & b) | (c & a);
			case 0xe5: return (~c & ~a) | (c & a) | (b & a);
			case 0xe6: return (c & ~b) | (~c & b) | (b & a);
			case 0xe7: return (~b & ~a) | (~c & ~a) | (c & a) | (b & a);
			case 0xe8: return (c & b) | (c & a) | (b & a);
			case 0xe9: return (~c & ~b & ~a) | (c & b) | (c & a) | (b & a);
			case 0xea: return (c) | (b & a);
			case 0xeb: return (~b & ~a) | (c) | (b & a);
			case 0xec: return (b) | (c & a);
			case 0xed: return (~c & ~a) | (b) | (c & a);
			case 0xee: return (c) | (b);
			case 0xef: return (~a) | (c) | (b);
			case 0xf0: return (a);
			case 0xf1: return (~c & ~b) | (a);
			case 0xf2: return (c & ~b) | (a);
			case 0xf3: return (~b) | (a);
			case 0xf4: return (~c & b) | (a);
			case 0xf5: return (~c) | (a);
			case 0xf6: return (c & ~b) | (~c & b) | (a);
			case 0xf7: return (~b) | (~c) | (a);
			case 0xf8: return (c & b) | (a);
			case 0xf9: return (~c & ~b) | (c & b) | (a);
			case 0xfa: return (c) | (a);
			case 0xfb: return (~b) | (c) | (a);
			case 0xfc: return (b) | (a);
			case 0xfd: return (~c) | (b) | (a);
			case 0xfe: return (c) | (b) | (a);
			case 0xff: return 0xffff;
			default: return 0;
		}
	}
	
	function blitter_dofast() {
		//console.log('blitter_dofast');
		var i,j;
		var bltadatptr = 0, bltbdatptr = 0, bltcdatptr = 0, bltddatptr = 0;
		var mt = bltcon0 & 0xFF;

		blit_masktable[0] = blt_info.bltafwm;
		blit_masktable[blt_info.hblitsize - 1] &= blt_info.bltalwm;

		if (bltcon0 & 0x800) {
			bltadatptr = bltapt;
			bltapt += (blt_info.hblitsize * 2 + blt_info.bltamod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x400) {
			bltbdatptr = bltbpt;
			bltbpt += (blt_info.hblitsize * 2 + blt_info.bltbmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x200) {
			bltcdatptr = bltcpt;
			bltcpt += (blt_info.hblitsize * 2 + blt_info.bltcmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x100) {
			bltddatptr = bltdpt;
			bltdpt += (blt_info.hblitsize * 2 + blt_info.bltdmod) * blt_info.vblitsize;
		}

		if (FAST && blitfunc_dofast[mt] !== 0 && !blitfill)
			blitfunc_dofast[mt](bltadatptr, bltbdatptr, bltcdatptr, bltddatptr, blt_info);
		else {
			var blitbhold = blt_info.bltbhold;
			var preva = 0, prevb = 0;
			var dstp = 0;
			var dodst = 0;

			for (j = 0; j < blt_info.vblitsize; j++) {
				blitfc = !!(bltcon1 & 0x4);
				for (i = 0; i < blt_info.hblitsize; i++) {
					var bltadat, blitahold;
					var bltbdat;
					if (bltadatptr) {
						//blt_info.bltadat = bltadat = AMIGA.mem.load16_chip(bltadatptr);
						blt_info.bltadat = bltadat = AMIGA.mem.chip.data[bltadatptr >>> 1];
						bltadatptr += 2;
					} else
						bltadat = blt_info.bltadat;
					bltadat &= blit_masktable[i];
					blitahold = (((preva << 16) | bltadat) >>> 0) >>> blt_info.blitashift;
					preva = bltadat;

					if (bltbdatptr) {
						//blt_info.bltbdat = bltbdat = AMIGA.mem.load16_chip(bltbdatptr);
						blt_info.bltbdat = bltbdat = AMIGA.mem.chip.data[bltbdatptr >>> 1];
						bltbdatptr += 2;
						blitbhold = (((prevb << 16) | bltbdat) >>> 0) >>> blt_info.blitbshift;
						prevb = bltbdat;
					}

					if (bltcdatptr) {
						//blt_info.bltcdat = AMIGA.mem.load16_chip(bltcdatptr);
						blt_info.bltcdat = AMIGA.mem.chip.data[bltcdatptr >>> 1];
						bltcdatptr += 2;
					}
					if (dodst)
						//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
						AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;
						
					blt_info.bltddat = (blit_func(blitahold & 0xffff, blitbhold & 0xffff, blt_info.bltcdat & 0xffff, mt) >>> 0) & 0xffff;
					if (blitfill) {
						var d = blt_info.bltddat;
						var ifemode = blitife ? 2 : 0;
						var fc1 = blit_filltable[d & 255][ifemode + blitfc][1];
						blt_info.bltddat = (blit_filltable[d & 255][ifemode + blitfc][0] + (blit_filltable[d >> 8][ifemode + fc1][0] << 8));
						blitfc = blit_filltable[d >> 8][ifemode + fc1][1];
					}
					if (blt_info.bltddat)
						blt_info.blitzero = 0;
					if (bltddatptr) {
						dodst = 1;
						dstp = bltddatptr;
						bltddatptr += 2;
					}
				}
				if (bltadatptr) bltadatptr += blt_info.bltamod;
				if (bltbdatptr) bltbdatptr += blt_info.bltbmod;
				if (bltcdatptr) bltcdatptr += blt_info.bltcmod;
				if (bltddatptr) bltddatptr += blt_info.bltdmod;
			}
			if (dodst)
				//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
				AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;

			blt_info.bltbhold = blitbhold;
		}
		blit_masktable[0] = 0xffff;
		blit_masktable[blt_info.hblitsize - 1] = 0xffff;

		bltstate = BLT_done;
	}

	function blitter_dofast_desc() {
		//console.log('blitter_dofast_desc');
		var i,j;
		var bltadatptr = 0, bltbdatptr = 0, bltcdatptr = 0, bltddatptr = 0;
		var mt = bltcon0 & 0xFF;

		blit_masktable[0] = blt_info.bltafwm;
		blit_masktable[blt_info.hblitsize - 1] &= blt_info.bltalwm;

		if (bltcon0 & 0x800) {
			bltadatptr = bltapt;
			bltapt -= (blt_info.hblitsize * 2 + blt_info.bltamod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x400) {
			bltbdatptr = bltbpt;
			bltbpt -= (blt_info.hblitsize * 2 + blt_info.bltbmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x200) {
			bltcdatptr = bltcpt;
			bltcpt -= (blt_info.hblitsize * 2 + blt_info.bltcmod) * blt_info.vblitsize;
		}
		if (bltcon0 & 0x100) {
			bltddatptr = bltdpt;
			bltdpt -= (blt_info.hblitsize * 2 + blt_info.bltdmod) * blt_info.vblitsize;
		}

		if (FAST && blitfunc_dofast_desc[mt] !== 0 && !blitfill)
			blitfunc_dofast_desc[mt](bltadatptr, bltbdatptr, bltcdatptr, bltddatptr, blt_info);
		else {
			var blitbhold = blt_info.bltbhold;
			var preva = 0, prevb = 0;
			var dstp = 0;
			var dodst = 0;

			for (j = 0; j < blt_info.vblitsize; j++) {
				blitfc = !!(bltcon1 & 0x4);
				for (i = 0; i < blt_info.hblitsize; i++) {
					var bltadat, blitahold;
					var bltbdat;
					if (bltadatptr) {
						//blt_info.bltadat = bltadat = AMIGA.mem.load16_chip(bltadatptr);
						blt_info.bltadat = bltadat = AMIGA.mem.chip.data[bltadatptr >>> 1];
						bltadatptr -= 2;
					} else
						bltadat = blt_info.bltadat;
					bltadat &= blit_masktable[i];
					blitahold = (((bltadat << 16) | preva) >>> 0) >> blt_info.blitdownashift;
					preva = bltadat;

					if (bltbdatptr) {
						//blt_info.bltbdat = bltbdat = AMIGA.mem.load16_chip(bltbdatptr);
						blt_info.bltbdat = bltbdat = AMIGA.mem.chip.data[bltbdatptr >>> 1];
						bltbdatptr -= 2;
						blitbhold = (((bltbdat << 16) | prevb) >>> 0) >> blt_info.blitdownbshift;
						prevb = bltbdat;
					}

					if (bltcdatptr) {
						//blt_info.bltcdat = blt_info.bltbdat = AMIGA.mem.load16_chip(bltcdatptr);
						blt_info.bltcdat = blt_info.bltbdat = AMIGA.mem.chip.data[bltcdatptr >>> 1];
						bltcdatptr -= 2;
					}
					if (dodst)
						//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
						AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;

					blt_info.bltddat = (blit_func(blitahold & 0xffff, blitbhold & 0xffff, blt_info.bltcdat & 0xffff, mt) >>> 0) & 0xffff;
					if (blitfill) {
						var d = blt_info.bltddat;
						var ifemode = blitife ? 2 : 0;
						var fc1 = blit_filltable[d & 255][ifemode + blitfc][1];
						blt_info.bltddat = (blit_filltable[d & 255][ifemode + blitfc][0] + (blit_filltable[d >> 8][ifemode + fc1][0] << 8));
						blitfc = blit_filltable[d >> 8][ifemode + fc1][1];
					}
					if (blt_info.bltddat)
						blt_info.blitzero = 0;
					if (bltddatptr) {
						dstp = bltddatptr;
						dodst = 1;
						bltddatptr -= 2;
					}
				}
				if (bltadatptr) bltadatptr -= blt_info.bltamod;
				if (bltbdatptr) bltbdatptr -= blt_info.bltbmod;
				if (bltcdatptr) bltcdatptr -= blt_info.bltcmod;
				if (bltddatptr) bltddatptr -= blt_info.bltdmod;
			}
			if (dodst)
				//AMIGA.mem.store16_chip(dstp, blt_info.bltddat);
				AMIGA.mem.chip.data[dstp >>> 1] = blt_info.bltddat;

			blt_info.bltbhold = blitbhold;
		}
		blit_masktable[0] = 0xffff;
		blit_masktable[blt_info.hblitsize - 1] = 0xffff;

		bltstate = BLT_done;
	}

	function blitter_read() {
		if (bltcon0 & 0x200) {
			if (AMIGA.dmaen(DMAF_BLTEN))
				//blt_info.bltcdat = AMIGA.mem.load16_chip(bltcpt);
				blt_info.bltcdat = AMIGA.mem.chip.data[bltcpt >>> 1];
		}
		bltstate = BLT_work;
	}

	function blitter_write() {
		if (blt_info.bltddat)
			blt_info.blitzero = 0;
			
		if (bltcon0 & 0x200) {
			if (AMIGA.dmaen(DMAF_BLTEN))
				//AMIGA.mem.store16_chip(bltdpt, blt_info.bltddat);
				AMIGA.mem.chip.data[bltdpt >>> 1] = blt_info.bltddat;
		}
		bltstate = BLT_next;
	}

	function blitter_line() {
		var blitahold = (blinea & blt_info.bltafwm) >>> blinea_shift;
		var blitchold = blt_info.bltcdat;

		blt_info.bltbhold = (blineb & 1) ? 0xffff : 0;
		blitlinepixel = !blitsing || (blitsing && !blitonedot);
		blt_info.bltddat = blit_func(blitahold, blt_info.bltbhold, blitchold, bltcon0 & 0xff);
		blitonedot++;
	}

	/*function blitter_line_incx()	{
		if (++blinea_shift == 16) {
			blinea_shift = 0;
			bltcpt += 2;
		}
	}
	function blitter_line_decx() {
		if (blinea_shift-- == 0) {
			blinea_shift = 15;
			bltcpt -= 2;
		}
	}
	function blitter_line_decy() {
		bltcpt -= blt_info.bltcmod;
		blitonedot = 0;
	}
	function blitter_line_incy() {
		bltcpt += blt_info.bltcmod;
		blitonedot = 0;
	}
	function blitter_line_proc() {
		if (bltcon0 & 0x800) {
			if (blitsign)
				bltapt_line += blt_info.bltbmod;
			else
				bltapt_line += blt_info.bltamod;		
		}
		if (!blitsign) {
			if (bltcon1 & 0x10) {
				if (bltcon1 & 0x8) {
					blitter_line_decy();
				} else {
					blitter_line_incy();
				}
			} else {
				if (bltcon1 & 0x8) {
					blitter_line_decx();
				} else {
					blitter_line_incx();
				}
			}
		}
		if (bltcon1 & 0x10) {
			if (bltcon1 & 0x4) {
				blitter_line_decx();
			} else {
				blitter_line_incx();
			}
		} else {
			if (bltcon1 & 0x4) {
				blitter_line_decy();
			} else {
				blitter_line_incy();
			}
		}
		blitsign = 0 > bltapt_line;
		bltstate = BLT_write;
	}*/
	
	function blitter_line_proc_fast() {
		if (bltcon0 & 0x800) {
			if (blitsign)
				bltapt_line += blt_info.bltbmod;
			else
				bltapt_line += blt_info.bltamod;		
		}
		if (!blitsign) {
			if (bltcon1 & 0x10) {
				if (bltcon1 & 0x8) {
					bltcpt -= blt_info.bltcmod;
					blitonedot = 0;
				} else {
					bltcpt += blt_info.bltcmod;
					blitonedot = 0;
				}
			} else {
				if (bltcon1 & 0x8) {
					if (blinea_shift-- == 0) {
						blinea_shift = 15;
						bltcpt -= 2;
					}
				} else {
					if (++blinea_shift == 16) {
						blinea_shift = 0;
						bltcpt += 2;
					}
				}
			}
		}
		if (bltcon1 & 0x10) {
			if (bltcon1 & 0x4) {
				if (blinea_shift-- == 0) {
					blinea_shift = 15;
					bltcpt -= 2;
				}
			} else {
				if (++blinea_shift == 16) {
					blinea_shift = 0;
					bltcpt += 2;
				}
			}
		} else {
			if (bltcon1 & 0x4) {
				bltcpt -= blt_info.bltcmod;
				blitonedot = 0;
			} else {
				bltcpt += blt_info.bltcmod;
				blitonedot = 0;
			}
		}
		blitsign = 0 > bltapt_line;
		bltstate = BLT_write;
	}

	function blitter_nxline()	{
		blineb = ((blineb << 1) | (blineb >> 15)) & 0xffff;
		blt_info.vblitsize--;
		bltstate = BLT_read;
	}

	function actually_do_blit() {
		if (blitline) {
			bltapt_line = bltapt & 0xffff; if (bltapt_line & 0x8000) bltapt_line -= 0x10000;			
			do {
				blitter_read();
				if (ddat1use)
					bltdpt = bltcpt;
				ddat1use = 1;
				blitter_line();
				blitter_line_proc_fast();
				blitter_nxline();
				if (blitlinepixel) {
					blitter_write();
					blitlinepixel = 0;
				}
				if (blt_info.vblitsize <= 0)
					bltstate = BLT_done;
			} while (bltstate != BLT_done);
			//bltapt_line = null;
			bltdpt = bltcpt;
		} else {
			if (blitdesc)
				blitter_dofast_desc();
			else
				blitter_dofast();			
			bltstate = BLT_done;
		}
	}

	function blitter_do() {
		actually_do_blit();
		blitter_done(AMIGA.playfield.hpos());
	}

	/*---------------------------------*/

	this.handler = function (data) {
		if (!AMIGA.dmaen(DMAF_BLTEN)) {
			AMIGA.events.newevent(EV2_BLITTER, 10, 0);
			if (++blit_stuck < 20000 || !AMIGA.config.blitter.immediate)
				return;

			BUG.info('blitter_handler() force-unstuck!');
		}
		blit_stuck = 0;
		if (blit_slowdown > 0 && !AMIGA.config.blitter.immediate) {
			//console.log('Blitter.handler () slowdown', blit_slowdown);
			AMIGA.events.newevent(EV2_BLITTER, blit_slowdown, 0);
			blit_slowdown = -1;
			return;
		}
		blitter_do();
	};

	var changetable = new Uint8Array(32 * 32); for (var i = 0; i < changetable.length; i++) changetable[i] = 0;	
	//var freezes = 10;
	function blit_bltset(con) {
		if (con & 2) {
			blitdesc = bltcon1 & 2;
			blt_info.blitbshift = bltcon1 >> 12;
			blt_info.blitdownbshift = 16 - blt_info.blitbshift;
		}

		if (con & 1) {
			blt_info.blitashift = bltcon0 >> 12;
			blt_info.blitdownashift = 16 - blt_info.blitashift;
		}

		blit_ch = (bltcon0 & 0x0f00) >> 8;
		blitline = (bltcon1 & 1) != 0;
		blitfill = !!(bltcon1 & 0x18);

		if (bltstate != BLT_done && blitline) {
			blitline = 0;
			bltstate = BLT_done;
			blit_interrupt = true;
			BUG.info('blit_bltset() register modification during linedraw! (%d)', bltstate);
		}

		if (blitline) {
			if (blt_info.hblitsize != 2)
				BUG.info('blit_bltset() weird hsize in linemode: %d vsize=%d', blt_info.hblitsize, blt_info.vblitsize);
			blit_diag = blit_cycle_diagram_line;
		} else {
			if (con & 2) {
				blitfc = !!(bltcon1 & 0x4);
				blitife = !!(bltcon1 & 0x8);
				if ((bltcon1 & 0x18) == 0x18) {
					//BUG.info('blit_bltset() weird fill mode');
					blitife = 0;
				}
			}
			//if (blitfill && !blitdesc) BUG.info('blit_bltset() fill without desc');
				
			blit_diag = blitfill && blit_cycle_diagram_fill[blit_ch][0] ? blit_cycle_diagram_fill[blit_ch] : blit_cycle_diagram[blit_ch];
		}
		if ((bltcon1 & 0x80) && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			BUG.info('blit_bltset() ECS BLTCON1 DOFF-bit set');

		// on the fly switching from CH=1 to CH=D -> blitter stops writing (Rampage/TEK)
		// currently just switch to no-channels mode, better than crashing the demo..
		if (bltstate != BLT_done) {
			var o = original_ch + (original_fill ? 16 : 0);
			var n = blit_ch + (blitfill ? 16 : 0);
			if (o != n) {
				if (changetable[o * 32 + n] < 10) {
					changetable[o * 32 + n]++;
					BUG.info('blit_bltset() channel mode changed while active (%02x->%02x)', o, n);
				}
			}
			if (blit_ch == 13 && original_ch == 1)
				blit_faulty = 1;
		}
		if (blit_faulty) {
			BUG.info('blit_bltset() blitter faulty!');
			blit_ch = 0;
			blit_diag = blit_cycle_diagram[blit_ch];
		}

		blit_dmacount = blit_dmacount2 = 0;
		blit_nod = 1;
		for (var i = 0; i < blit_diag[0]; i++) {
			var v = blit_diag[1 + blit_diag[0] + i];
			if (v <= 4)
				blit_dmacount++;
			if (v > 0 && v < 4)
				blit_dmacount2++;
			if (v == 4)
				blit_nod = 0;
		}
	}

	function reset_blit(bltcon) {
		if (bltcon & 1)
			blinea_shift = bltcon0 >> 12;
		if (bltcon & 2)
			blitsign = (bltcon1 & 0x40) != 0;
		if (bltstate == BLT_done)
			return;
		if (bltcon)
			blit_bltset(bltcon);
	}

	var warned1 = 10;	
	function waitingblits() {
		var waited = false;
		while (bltstate != BLT_done && AMIGA.dmaen(DMAF_BLTEN)) {
			waited = true;
			AMIGA.events.cycle(8 * CYCLE_UNIT);
		}
		if (warned1 && waited) {
			warned1--;
			BUG.info('waiting_blits detected');
		}
		return bltstate == BLT_done;

	}

	function do_blitter(hpos, copper) {
		var cycles;

		var cleanstart = 0;
		if (bltstate == BLT_done) {
			if (blit_faulty > 0)
				blit_faulty = 0;
			cleanstart = 1;
		}

		blt_info.blitzero = 1;
		blt_info.got_cycle = 0;

		blit_firstline_cycles = blit_first_cycle = AMIGA.events.currcycle;
		blit_last_cycle = 0;
		last_blitter_hpos = hpos + 1;

		blit_bltset(1 | 2);
		ddat1use = ddat2use = 0;
		blit_interrupt = false;

		if (blitline) {
			blinea = blt_info.bltadat;
			blineb = ((blt_info.bltbdat >>> blt_info.blitbshift) | (blt_info.bltbdat << (16 - blt_info.blitbshift))) & 0xffff;
			blitonedot = 0;
			blitlinepixel = 0;
			blitsing = (bltcon1 & 0x2) != 0;
			cycles = blt_info.vblitsize;
		} else {
			blit_firstline_cycles = blit_first_cycle + (blit_diag[0] * blt_info.hblitsize + AMIGA.cpu.cycles) * CYCLE_UNIT;
			cycles = blt_info.vblitsize * blt_info.hblitsize;
		}

		if (cleanstart) {
			original_ch = blit_ch;
			original_fill = blitfill;
			original_line = blitline;
		}

		/*if (0) {
			var ch = 0;
			if (blit_ch & 1) ch++;
			if (blit_ch & 2) ch++;
			if (blit_ch & 4) ch++;
			if (blit_ch & 8) ch++;
			BUG.info('do_blitter2() %dx%d ch=%d %d*%d=%d d=%d f=%d n=%d l=%d dma=%04x %s',
				blt_info.hblitsize, blt_info.vblitsize, ch, blit_diag[0], cycles, blit_diag[0] * cycles,
				blitdesc ? 1 : 0, blitfill ? 1 : 0, AMIGA.dmaen(DMAF_BLTPRI) ? 1 : 0, blitline ? 1 : 0,
				AMIGA.dmacon, AMIGA.dmaen(DMAF_BLTEN) ? 'on' : 'off!');
			blitter_dump();
		}*/

		bltstate = BLT_init;
		blit_slowdown = 0;

		clr_special(SPCFLAG_BLTNASTY);
		if (AMIGA.dmaen(DMAF_BLTPRI))
			set_special(SPCFLAG_BLTNASTY);

		if (AMIGA.dmaen(DMAF_BLTEN))
			bltstate = BLT_work;

		if (blt_info.vblitsize == 0 || (blitline && blt_info.hblitsize != 2)) {
			blitter_done(hpos);
			return;
		}
		blt_info.got_cycle = 1;

		if (AMIGA.config.blitter.immediate) {
			blitter_do();
			return;
		}

		blit_cyclecounter = cycles * (blit_dmacount2 + (blit_nod ? 0 : 1)); 		

		AMIGA.events.newevent(EV2_BLITTER, blit_cyclecounter, 0);

		if (AMIGA.dmaen(DMAF_BLTEN)) {
			if (AMIGA.config.blitter.waiting) {
				// wait immediately if all cycles in use and blitter nastry
				if (blit_dmacount == blit_diag[0] && (AMIGA.spcflags & SPCFLAG_BLTNASTY))
					waitingblits();
			}
		}
	}
	
	var warned2 = 10;
	this.maybe_blit = function (hpos, hack) {
		if (bltstate == BLT_done)
			return;

		if (AMIGA.dmaen(DMAF_BLTEN)) {
			var doit = false;
			if (AMIGA.config.blitter.waiting == 3) { // always
				doit = true;
			} else if (AMIGA.config.blitter.waiting == 2) { // no idle
				if (blit_dmacount == blit_diag[0] && (AMIGA.spcflags & SPCFLAG_BLTNASTY))
					doit = true;
			} else if (AMIGA.config.blitter.waiting == 1) { // automatic
				if (blit_dmacount == blit_diag[0] && (AMIGA.spcflags & SPCFLAG_BLTNASTY))
					doit = true;
				else if (AMIGA.config.cpu.speed < 0)
					doit = true;
			}
			if (doit) {
				if (waitingblits())
					return;
			}
		}

		if (warned2 && AMIGA.dmaen(DMAF_BLTEN) && blt_info.got_cycle) {
			warned2--;
			BUG.info('maybe_blit() program does not wait for blitter tc=%d', blit_cyclecounter);
		}

		if (hack == 1 && AMIGA.events.currcycle < blit_firstline_cycles)
			return;

		AMIGA.blitter.handler(0);
	};

	this.blitnasty = function () {
		if (bltstate == BLT_done || !AMIGA.dmaen(DMAF_BLTEN))
			return 0;
		if (blit_last_cycle >= blit_diag[0] && blit_dmacount == blit_diag[0])
			return 0;

		var cycles = Math.floor((AMIGA.events.currcycle - blit_first_cycle) * CYCLE_UNIT_INV);
		var ccnt = 0;
		while (blit_last_cycle < cycles) {
			if (!channel_state(blit_last_cycle++))
				ccnt++;
		}
		return ccnt;
	};

	/*---------------------------------*/

	var oddfstrt = 0, oddfstop = 0, ototal = 0, ofree = 0, slow = 0;
	this.slowdown = function () {
		var data = AMIGA.playfield.getData();
		var ddfstrt = data[0];
		var ddfstop = data[1];
		var totalcycles = data[2];
		var freecycles = data[3];

		if (!totalcycles || ddfstrt < 0 || ddfstop < 0)
			return;
		if (ddfstrt != oddfstrt || ddfstop != oddfstop || totalcycles != ototal || ofree != freecycles) {
			var linecycles = Math.floor(((ddfstop - ddfstrt + totalcycles - 1) / totalcycles) * totalcycles);
			var freelinecycles = Math.floor(((ddfstop - ddfstrt + totalcycles - 1) / totalcycles) * freecycles);
			var dmacycles = Math.floor((linecycles * blit_dmacount) / blit_diag[0]);

			oddfstrt = ddfstrt;
			oddfstop = ddfstop;
			ototal = totalcycles;
			ofree = freecycles;
			slow = 0;
			if (dmacycles > freelinecycles)
				slow = dmacycles - freelinecycles;
		}
		if (blit_slowdown < 0 || blitline)
			return;

		blit_slowdown += slow;
	};
		
	/*---------------------------------*/

	this.BLTADAT = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		blt_info.bltadat = v;
	};
	this.BLTBDAT = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		if (bltcon1 & 2)
			blt_info.bltbhold = (v << (bltcon1 >> 12)) & 0xffff;
		else
			blt_info.bltbhold = (v >> (bltcon1 >> 12)) & 0xffff;

		blt_info.bltbdat = v;
	};
	this.BLTCDAT = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		blt_info.bltcdat = v;
		reset_blit(0);
	};

	this.BLTAMOD = function (hpos, v) {
		this.maybe_blit(hpos, 1);
		blt_info.bltamod = castWord(v & 0xfffe);
		reset_blit(0);
	};
	this.BLTBMOD = function (hpos, v) {
		this.maybe_blit(hpos, 1);
		blt_info.bltbmod = castWord(v & 0xfffe);
		reset_blit(0);
	};
	this.BLTCMOD = function (hpos, v) {
		this.maybe_blit(hpos, 1);
		blt_info.bltcmod = castWord(v & 0xfffe);
		reset_blit(0);
	};
	this.BLTDMOD = function (hpos, v) {
		this.maybe_blit(hpos, 1);
		blt_info.bltdmod = castWord(v & 0xfffe);
		reset_blit(0);
	};

	this.BLTCON0 = function (hpos, v) {
		this.maybe_blit(hpos, 2);
		bltcon0 = v;
		reset_blit(1);
	};
	this.BLTCON0L = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) return;
		this.maybe_blit(hpos, 2);
		bltcon0 = (bltcon0 & 0xFF00) | (v & 0xFF);
		reset_blit(1);
	};
	this.BLTCON1 = function (hpos, v) {
		this.maybe_blit(hpos, 2);
		bltcon1 = v;
		reset_blit(2);
	};

	this.BLTAFWM = function (hpos, v) {
		this.maybe_blit(hpos, 2);
		blt_info.bltafwm = v;
		reset_blit(0);
	};
	this.BLTALWM = function (hpos, v) {
		this.maybe_blit(hpos, 2);
		blt_info.bltalwm = v;
		reset_blit(0);
	};

	this.BLTAPTH = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltapt = ((bltapt & 0xffff) | (v << 16)) >>> 0;
	};
	this.BLTAPTL = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltapt = ((bltapt & ~0xffff) | (v & 0xfffe)) >>> 0;
	};
	this.BLTBPTH = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltbpt = ((bltbpt & 0xffff) | (v << 16)) >>> 0;
	};
	this.BLTBPTL = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltbpt = ((bltbpt & ~0xffff) | (v & 0xfffe)) >>> 0;
	};
	this.BLTCPTH = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltcpt = ((bltcpt & 0xffff) | (v << 16)) >>> 0;
	};
	this.BLTCPTL = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltcpt = ((bltcpt & ~0xffff) | (v & 0xfffe)) >>> 0;
	};
	this.BLTDPTH = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltdpt = ((bltdpt & 0xffff) | (v << 16)) >>> 0;
	};
	this.BLTDPTL = function (hpos, v) {
		this.maybe_blit(hpos, 0);
		bltdpt = ((bltdpt & ~0xffff) | (v & 0xfffe)) >>> 0;
	};

	this.BLTSIZE = function (hpos, v) {
		this.maybe_blit(hpos, 0);

		blt_info.vblitsize = v >> 6;
		blt_info.hblitsize = v & 0x3F;
		if (!blt_info.vblitsize)
			blt_info.vblitsize = 1024;
		if (!blt_info.hblitsize)
			blt_info.hblitsize = 64;

		do_blitter(hpos, AMIGA.copper.access);
	};

	this.BLTSIZV = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) return;
		this.maybe_blit(hpos, 0);
		blt_info.vblitsize = v & 0x7FFF;
	};

	this.BLTSIZH = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) return;
		this.maybe_blit(hpos, 0);
		blt_info.hblitsize = v & 0x7FF;
		if (!blt_info.vblitsize)
			blt_info.vblitsize = 0x8000;
		if (!blt_info.hblitsize)
			blt_info.hblitsize = 0x0800;

		do_blitter(hpos, AMIGA.copper.access);
	};
	
	/*---------------------------------*/

	this.getState = function () {
		return bltstate;
	};
	this.setState = function (s) {
		bltstate = s;
	};
	this.getIntZero = function() { 
		return [blit_interrupt, blt_info.blitzero];
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

/*const CIAA_DEBUG_R = 0;
const CIAA_DEBUG_W = 0;
const CIAB_DEBUG_R = 0;
const CIAB_DEBUG_W = 0;
const DONGLE_DEBUG = 0;
const KB_DEBUG = 0;
const CLOCK_DEBUG = 0;*/

const TOD_HACK = 1;

/* e-clock is 10 CPU cycles, 4 cycles high, 6 low data transfer happens during 4 high cycles */
const ECLOCK_DATA_CYCLE = 4;
const ECLOCK_WAIT_CYCLE = 6;

const DIV10 = ((ECLOCK_DATA_CYCLE + ECLOCK_WAIT_CYCLE) * CYCLE_UNIT / 2); /* Yes, a bad identifier. */
const CIASTARTCYCLESHI = 3;
const CIASTARTCYCLESCRA = 2;

//console.log('DIV10', CYCLE_UNIT, DIV10);

function CIA() {
	var ciaaicr = 0, ciaaimask = 0, ciabicr = 0, ciabimask = 0;
	var ciaacra = 0, ciaacrb = 0, ciabcra = 0, ciabcrb = 0;
	var ciaastarta = 0, ciaastartb = 0, ciabstarta = 0, ciabstartb = 0;
	var ciaaicr_reg = 0, ciabicr_reg = 0;

	var ciaata = 0, ciaatb = 0, ciabta = 0, ciabtb = 0;
	var ciaata_passed = 0, ciaatb_passed = 0, ciabta_passed = 0, ciabtb_passed = 0;

	var ciaatod = 0, ciabtod = 0, ciaatol = 0, ciabtol = 0, ciaaalarm = 0, ciabalarm = 0;
	var ciaatlatch = 0, ciabtlatch = 0;
	var oldled = false;//, oldovl = false, oldcd32mute = false;
	var led = false;
	var led_old_brightness = 0;
	var led_cycles_on = 0, led_cycles_off = 0, led_cycle = 0;

	var ciaala = 0, ciaalb = 0, ciabla = 0, ciablb = 0;
	var ciaatodon = 0, ciabtodon = 0;
	var ciaapra = 0, ciaaprb = 0, ciaadra = 0, ciaadrb = 0, ciaasdr = 0, ciaasdr_cnt = 0;
	var ciabpra = 0, ciabprb = 0, ciabdra = 0, ciabdrb = 0, ciabsdr = 0, ciabsdr_cnt = 0;
	var div10 = 0;
	//var kbstate = 0, kblostsynccnt = 0, kbcode = 0;

	//var serbits = 0;
	var warned = 10;
	//var rtc_delayed_write = 0;

	/*function setclr (unsigned int *p, unsigned int val) {
		if (val & 0x80) {
			*p |= val & 0x7F;
		} else {
			*p &= ~val;
		}
	}*/

	function setclra(val) {
		if (val & 0x80) {
			ciaaimask |= val & 0x7F;
		} else {
			ciaaimask &= ~val;
		}
	}
	function setclrb(val) {
		if (val & 0x80) {
			ciabimask |= val & 0x7F;
		} else {
			ciabimask &= ~val;
		}
	}

	function RethinkICRA() {
		if (ciaaicr) {
			if (ciaaimask & ciaaicr) {
				ciaaicr |= 0x80;
				AMIGA.INTREQ_0(0x8000 | 0x0008);
			}
			ciaaicr_reg |= ciaaicr;
		}
	}

	function RethinkICRB() {
		if (ciabicr) {
			if (ciabimask & ciabicr) {
				ciabicr |= 0x80;
				AMIGA.INTREQ_0(0x8000 | 0x2000);
			}
			ciabicr_reg |= ciabicr;
		}
	}

	this.SetICRA = function (icr, sdr) {
		ciaaicr |= icr;
		ciaasdr = sdr;
		RethinkICRA();
	};

	this.SetICRB = function (icr, sdr) {
		ciabicr |= icr;
		if (sdr !== null)
			ciabsdr = sdr;
		RethinkICRB();
	};

	this.rethink = function () {
		RethinkICRA();
		RethinkICRB();
	};

	/* Figure out how many CIA timer cycles have passed for each timer since the last call of CIA_calctimers.  */
	function compute_passed_time() {
		var ccount = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles + div10);
		var ciaclocks = Math.floor(ccount / DIV10);

		ciaata_passed = ciaatb_passed = ciabta_passed = ciabtb_passed = 0;

		/* CIA A timers */
		if ((ciaacra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciaastarta)
				cc -= ciaastarta;
			else
				cc = 0;
			//assert((ciaata + 1) >= cc);
			ciaata_passed = cc;
		}
		if ((ciaacrb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciaastartb)
				cc -= ciaastartb;
			else
				cc = 0;
			//assert((ciaatb + 1) >= cc);
			ciaatb_passed = cc;
		}

		/* CIA B timers */
		if ((ciabcra & 0x21) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciabstarta)
				cc -= ciabstarta;
			else
				cc = 0;
			//assert((ciabta + 1) >= cc);
			ciabta_passed = cc;
		}
		if ((ciabcrb & 0x61) == 0x01) {
			var cc = ciaclocks;
			if (cc > ciabstartb)
				cc -= ciabstartb;
			else
				cc = 0;
			//assert((ciabtb + 1) >= cc);
			ciabtb_passed = cc;
		}
	}

	/* Called to advance all CIA timers to the current time.  This expects that
	one of the timer values will be modified, and CIA_calctimers will be called
	in the same cycle.  */

	function CIA_update_check() {
		var ccount = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles + div10);
		var ciaclocks = Math.floor(ccount / DIV10);

		var aovfla = 0, aovflb = 0, asp = 0, bovfla = 0, bovflb = 0, bsp = 0;
		var icr = 0;

		div10 = ccount % DIV10;

		/* CIA A timers */
		if ((ciaacra & 0x21) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciaastarta > 0) {
				if (cc > ciaastarta) {
					cc -= ciaastarta;
					ciaastarta = 0;
				} else {
					ciaastarta -= cc;
					check = false;
				}
			}
			if (check) {
				//assert((ciaata + 1) >= cc);
				if ((ciaata + 1) == cc) {
					if ((ciaacra & 0x48) == 0x40 && ciaasdr_cnt > 0 && --ciaasdr_cnt == 0)
						asp = 1;
					aovfla = 1;
					if ((ciaacrb & 0x61) == 0x41 || (ciaacrb & 0x61) == 0x61) {
						if (ciaatb-- == 0)
							aovflb = 1;
					}
				}
				ciaata -= cc;
			}
		}
		if ((ciaacrb & 0x61) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciaastartb > 0) {
				if (cc > ciaastartb) {
					cc -= ciaastartb;
					ciaastartb = 0;
				} else {
					ciaastartb -= cc;
					check = false;
				}
			}
			if (check) {
				//assert((ciaatb + 1) >= cc);
				if ((ciaatb + 1) == cc)
					aovflb = 1;
				ciaatb -= cc;
			}
		}

		/* CIA B timers */
		if ((ciabcra & 0x21) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciabstarta > 0) {
				if (cc > ciabstarta) {
					cc -= ciabstarta;
					ciabstarta = 0;
				} else {
					ciabstarta -= cc;
					check = false;
				}
			}
			if (check) {
				//assert((ciabta + 1) >= cc);
				if ((ciabta + 1) == cc) {
					if ((ciabcra & 0x48) == 0x40 && ciabsdr_cnt > 0 && --ciabsdr_cnt == 0)
						bsp = 1;
					bovfla = 1;
					if ((ciabcrb & 0x61) == 0x41 || (ciabcrb & 0x61) == 0x61) {
						if (ciabtb-- == 0)
							bovflb = 1;
					}
				}
				ciabta -= cc;
			}
		}
		if ((ciabcrb & 0x61) == 0x01) {
			var check = true;
			var cc = ciaclocks;
			if (ciabstartb > 0) {
				if (cc > ciabstartb) {
					cc -= ciabstartb;
					ciabstartb = 0;
				} else {
					ciabstartb -= cc;
					check = false;
				}
			}
			if (check) {
				//assert((ciabtb + 1) >= cc);
				if ((ciabtb + 1) == cc)
					bovflb = 1;
				ciabtb -= cc;
			}
		}

		if (aovfla) {
			ciaaicr |= 1; icr = 1;
			ciaata = ciaala;
			if (ciaacra & 0x8) {
				ciaacra &= ~1;
			}
		}
		if (aovflb) {
			ciaaicr |= 2; icr = 1;
			ciaatb = ciaalb;
			if (ciaacrb & 0x8) {
				ciaacrb &= ~1;
			}
		}
		if (asp) {
			ciaaicr |= 8; icr = 1;
		}
		if (bovfla) {
			ciabicr |= 1; icr |= 2;
			ciabta = ciabla;
			if (ciabcra & 0x8) {
				ciabcra &= ~1;
			}
		}
		if (bovflb) {
			ciabicr |= 2; icr |= 2;
			ciabtb = ciablb;
			if (ciabcrb & 0x8) {
				ciabcrb &= ~1;
			}
		}
		if (bsp) {
			ciabicr |= 8; icr |= 2;
		}
		return icr;
	}

	function CIA_update() {
		var icr = CIA_update_check ();
		if (icr & 1)
			RethinkICRA();
		if (icr & 2)
			RethinkICRB();
	}

	/* Call this only after CIA_update has been called in the same cycle.  */
	function CIA_calctimers() {
		var ciaatimea = -1, ciaatimeb = -1, ciabtimea = -1, ciabtimeb = -1;
		var div10diff = DIV10 - div10;

		if ((ciaacra & 0x21) == 0x01) ciaatimea = div10diff + DIV10 * (ciaata + ciaastarta);
		if ((ciaacrb & 0x61) == 0x01) ciaatimeb = div10diff + DIV10 * (ciaatb + ciaastartb);
		if ((ciabcra & 0x21) == 0x01) ciabtimea = div10diff + DIV10 * (ciabta + ciabstarta);
		if ((ciabcrb & 0x61) == 0x01) ciabtimeb = div10diff + DIV10 * (ciabtb + ciabstartb);

		AMIGA.events.eventtab[EV_CIA].oldcycles = AMIGA.events.currcycle;
		AMIGA.events.eventtab[EV_CIA].active = (ciaatimea != -1 || ciaatimeb != -1 || ciabtimea != -1 || ciabtimeb != -1);

		if (AMIGA.events.eventtab[EV_CIA].active) {
			var ciatime = CYCLE_MAX;
			if (ciaatimea != -1) ciatime = ciaatimea;
			if (ciaatimeb != -1 && ciaatimeb < ciatime) ciatime = ciaatimeb;
			if (ciabtimea != -1 && ciabtimea < ciatime) ciatime = ciabtimea;
			if (ciabtimeb != -1 && ciabtimeb < ciatime) ciatime = ciabtimeb;
			AMIGA.events.eventtab[EV_CIA].evtime = ciatime + AMIGA.events.currcycle;
		}
		AMIGA.events.schedule();
	}

	this.handler = function () {
		CIA_update();
		CIA_calctimers();
	};

	/*this.diskindex = function() {
		ciabicr |= 0x10;
		RethinkICRB();
	}
	this.parallelack = function() {
		ciaaicr |= 0x10;
		RethinkICRA();
	}*/

	function checkalarm (tod, alarm, inc) {
		if (tod == alarm)
			return 1;
		if (!inc)
			return 0;
		/* emulate buggy TODMED counter.
		* it counts: .. 29 2A 2B 2C 2D 2E 2F 20 30 31 32 ..
		* (2F->20->30 only takes couple of cycles but it will trigger alarm..
		*/
		if (tod & 0x000fff)
			return 0;
		if (((tod - 1) & 0xfff000) == alarm)
			return 1;
		return 0;
	}

	function ciab_checkalarm(inc) {
		if (checkalarm(ciabtod, ciabalarm, inc)) {
			ciabicr |= 4;
			RethinkICRB();
		}
	}

	function ciaa_checkalarm(inc) {
		if (checkalarm(ciaatod, ciaaalarm, inc)) {
			ciaaicr |= 4;
			RethinkICRA();
		}
	}

	function gettimeofday() {
		return Math.floor(new Date().getTime()); 
	}

//#ifdef TOD_HACK
	var tod_hack_tv = 0, tod_hack_tod = 0, tod_hack_tod_last = 0;
	var tod_hack_enabled = -1;
	const TOD_HACK_TIME = 312 * 50 * 10;
	function tod_hack_reset() {
		//var tv;
		//gettimeofday (&tv, NULL);
		//tod_hack_tv = (uae_u64)tv.tv_sec * 1000000 + tv.tv_usec;
		tod_hack_tv = gettimeofday();
		tod_hack_tod = ciaatod;
		tod_hack_tod_last = tod_hack_tod;
	}
//#endif

	/*var heartbeat_cnt = 0;
	function cia_heartbeat() {
		heartbeat_cnt = 10;
	}*/

	var oldrate = 0;
	function do_tod_hack(dotod) {
		//console.log('tod',tod_hack_enabled);
		//var tv;
		var t;
		var rate;
		var docount = 0;

		if (tod_hack_enabled == 0)
			return;
		/*if (!heartbeat_cnt) {
			if (tod_hack_enabled > 0)
				tod_hack_enabled = -1;
			return;
		}*/
		if (tod_hack_enabled < 0) {
			tod_hack_enabled = TOD_HACK_TIME;
			return;
		}
		if (tod_hack_enabled > 1) {
			tod_hack_enabled--;
			if (tod_hack_enabled == 1) {
				BUG.info('TOD HACK enabled');
				tod_hack_reset();
			}
			return;
		}

		if (AMIGA.config.cia.tod == 0)
			rate = Math.floor(AMIGA.playfield.vblank_hz + 0.5);
		else if (AMIGA.config.cia.tod == 1)
			rate = 50;
		else
			rate = 60;
		if (rate <= 0)
			return;
		if (rate != oldrate || ciaatod != tod_hack_tod_last) {
			if (ciaatod != 0) BUG.info('TOD HACK reset %d,%d %d,%d', rate, oldrate, ciaatod, tod_hack_tod_last);
			tod_hack_reset();
			oldrate = rate;
			docount = 1;
		}
		if (!dotod && AMIGA.config.cia.tod == 0)
			return;

		/*gettimeofday (&tv, NULL); 
		t = (uae_u64)tv.tv_sec * 1000000 + tv.tv_usec;
		if (t - tod_hack_tv >= 1000000 / rate) {
			tod_hack_tv += 1000000 / rate;
			docount = 1;
		}*/
		t = gettimeofday();
		if (t - tod_hack_tv >= Math.floor(1000 / rate)) {
			tod_hack_tv += Math.floor(1000 / rate);
			docount = 1;
		}
		if (docount) {
			ciaatod++;
			ciaatod &= 0x00ffffff;
			tod_hack_tod_last = ciaatod;
			ciaa_checkalarm(0);
		}
	}

	//this.hsync_prehandler = function() {}

	this.hsync_posthandler = function (dotod) {
		if (ciabtodon && dotod) {
			ciabtod++;
			ciabtod &= 0xFFFFFF;
			ciab_checkalarm(1);
		}
		if (AMIGA.config.cia.tod_hack && ciaatodon)
			do_tod_hack(dotod);

		/*if (resetwarning_phase) {
		 resetwarning_check ();
		 while (keys_available ())
		 get_next_key ();
		 } else if ((keys_available () || kbstate < 3) && !kblostsynccnt && (hsync_counter & 15) == 0) {
		 switch (kbstate) {
		 case 0:
		 kbcode = 0;
		 kbstate++;
		 break;
		 case 1:
		 setcode(AK_INIT_POWERUP);
		 kbstate++;
		 break;
		 case 2:
		 setcode(AK_TERM_POWERUP);
		 kbstate++;
		 break;
		 case 3:
		 kbcode = ~get_next_key();
		 break;
		 }
		 keyreq();
		 }*/
		AMIGA.input.keyboard.hsync();
	};

	function calc_led(old_led) {
		var c = AMIGA.events.currcycle;
		var t = Math.floor((c - led_cycle) * CYCLE_UNIT_INV);
		if (old_led)
			led_cycles_on += t;
		else
			led_cycles_off += t;
		led_cycle = c;
	}

	var powerled_brightness = 255;
	var powerled = true;
	function led_vsync() {
		var v;

		calc_led(led);
		if (led_cycles_on && !led_cycles_off)
			v = 255;
		else if (led_cycles_off && !led_cycles_on)
			v = 0;
		else if (led_cycles_off)
			v = Math.floor(led_cycles_on * 255 / (led_cycles_on + led_cycles_off));
		else
			v = 255;
		if (v < 0) v = 0;
		if (v > 255) v = 255;

		/*gui_data.powerled_brightness = v;
		if (led_old_brightness != gui_data.powerled_brightness) {
			gui_data.powerled = gui_data.powerled_brightness > 127;
			gui_led (LED_POWER, gui_data.powerled);
			led_filter_audio ();
		}
		led_old_brightness = gui_data.powerled_brightness;*/

		powerled_brightness = v;
		if (led_old_brightness != powerled_brightness) {
			powerled = powerled_brightness > 127;
			AMIGA.config.hooks.power_led(powerled);
			AMIGA.audio.filter.led_filter_on = powerled;
		}
		led_old_brightness = powerled_brightness;

		led_cycle = AMIGA.events.currcycle;
		led_cycles_on = 0;
		led_cycles_off = 0;
	}

	this.vsync_prehandler = function () {
		/*if (rtc_delayed_write < 0) {
		 rtc_delayed_write = 50;
		 } else if (rtc_delayed_write > 0) {
		 rtc_delayed_write--;
		 if (rtc_delayed_write == 0)
		 write_battclock ();
		 }*/
		led_vsync();
		this.handler();
		/*if (kblostsynccnt > 0) {
		 kblostsynccnt -= maxvpos;
		 if (kblostsynccnt <= 0) {
		 kblostsynccnt = 0;
		 keyreq ();
		 write_log (_T('lostsync\n'));
		 }
		 }*/
		AMIGA.input.keyboard.vsync();
	};

	this.vsync_posthandler = function (dotod) {
		//if (heartbeat_cnt > 0) heartbeat_cnt--;
		if (TOD_HACK) {
			if (AMIGA.config.cia.tod_hack && tod_hack_enabled == 1)
				return;
		}
		if (ciaatodon && dotod) {
			ciaatod++;
			ciaatod &= 0xFFFFFF;
			ciaa_checkalarm(1);
		}
		/*if (vpos == 0) {
		 write_log ('%d', vsync_counter);
		 this.dump();
		 }*/
	};

	function bfe001_change() {
		var v = ciaapra;
		var led2;

		v |= ~ciaadra; /* output is high when pin's direction is input */
		led2 = (v & 2) ? 0 : 1;
		if (led2 != led) {
			calc_led(led);
			led = led2;
			led_old_brightness = -1;
		}
		/*if (currprefs.cs_ciaoverlay && (v & 1) != oldovl) {
			oldovl = v & 1;
			if (!oldovl) {
				map_overlay (1);
			} else {
				//activate_debugger ();
				map_overlay (0);
			}
		}
		if (currprefs.cs_cd32cd && (v & 1) != oldcd32mute) {
			oldcd32mute = v & 1;
			akiko_mute (oldcd32mute ? 0 : 1);
		}*/
	}
	
	function handle_joystick_buttons(pra, dra) {
		var tmp = 0;
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			if (!AMIGA.input.mouse.button[0]) tmp |= 0x40;
			if (dra & 0x40) tmp = (tmp & ~0x40) | (pra & 0x40);
		} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			if (!AMIGA.input.joystick[0].button[0]) tmp |= 0x40;
			if (dra & 0x40) tmp = (tmp & ~0x40) | (pra & 0x40);
		} else tmp |= 0x40;

		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			if (!AMIGA.input.joystick[1].button[0]) tmp |= 0x80;
			if (dra & 0x80) tmp = (tmp & ~0x80) | (pra & 0x80);
		} else tmp |= 0x80;

		return tmp;
	}
	
	function handle_parport_joystick (port, pra, dra) {
		var v;
		switch (port) {
			case 0:
				v = (pra & dra) | (dra ^ 0xff);
				return v;
			case 1:
				v = ((pra & dra) | (dra ^ 0xff)) & 0x7;
				return v;
			default:
				return 0;
		}
	}
	
	function ReadCIAA(addr) {
		var tmp;
		var reg = addr & 15;

		compute_passed_time();

		//if (CIAA_DEBUG_R) write_log (_T('R_CIAA: bfe%x01 %08X\n'), reg, M68K_GETPC);

		switch (reg) {
		case 0:
			tmp = AMIGA.disk.status() & 0x3c;
			tmp |= handle_joystick_buttons(ciaapra, ciaadra);
			tmp |= (ciaapra | (ciaadra ^ 3)) & 0x03;
			//tmp = dongle_cia_read (0, reg, tmp);
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE001 R %02X %s\n'), tmp, debuginfo(0));
			return tmp;
		case 1:
/*#ifdef PARALLEL_PORT
			if (isprinter () > 0) {
				tmp = ciaaprb;
			} else if (isprinter () < 0) {
				uae_u8 v;
				parallel_direct_read_data (&v);
				tmp = v;
			} else if (currprefs.win32_samplersoundcard >= 0) {
				tmp = sampler_getsample ((ciabpra & 4) ? 1 : 0);
			} else
#endif*/
			{
				tmp = handle_parport_joystick(0, ciaaprb, ciaadrb);
				//tmp = dongle_cia_read (1, reg, tmp);
				//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE101 R %02X %s\n'), tmp, debuginfo(0));
			}
			if (ciaacrb & 2) {
				var pb7 = 0;
				if (ciaacrb & 4)
					pb7 = ciaacrb & 1;
				tmp &= ~0x80;
				tmp |= pb7 ? 0x80 : 0;
			}
			if (ciaacra & 2) {
				var pb6 = 0;
				if (ciaacra & 4)
					pb6 = ciaacra & 1;
				tmp &= ~0x40;
				tmp |= pb6 ? 0x40 : 0;
			}
			return tmp;
		case 2:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE201 R %02X %s\n'), ciaadra, debuginfo(0));
			return ciaadra;
		case 3:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE301 R %02X %s\n'), ciaadrb, debuginfo(0));
			return ciaadrb;
		case 4:
			return (ciaata - ciaata_passed) & 0xff;
		case 5:
			return ((ciaata - ciaata_passed) >> 8) & 0xff;
		case 6:
			return (ciaatb - ciaatb_passed) & 0xff;
		case 7:
			return ((ciaatb - ciaatb_passed) >> 8) & 0xff;
		case 8:
			if (ciaatlatch) {
				ciaatlatch = 0;
				return ciaatol & 0xff;
			} else
				return ciaatod & 0xff;
		case 9:
			if (ciaatlatch)
				return (ciaatol >> 8) & 0xff;
			else
				return (ciaatod >> 8) & 0xff;
		case 10:
			if (!ciaatlatch) { 
				if (!(ciaacrb & 0x80))
					ciaatlatch = 1;
				ciaatol = ciaatod;
			}
			return (ciaatol >> 16) & 0xff;
		case 12:
			return ciaasdr;
		case 13:
			tmp = ciaaicr_reg;
			ciaaicr &= ~ciaaicr_reg;
			ciaaicr_reg = 0;
			RethinkICRA();
			return tmp;
		case 14:
			return ciaacra;
		case 15:
			return ciaacrb;
		}
		return 0;
	}

	function ReadCIAB(addr) {
		var tmp;
		var reg = addr & 15;

		//if ((addr >= 8 && addr <= 10) || CIAB_DEBUG_R > 1) write_log (_T('R_CIAB: bfd%x00 %08X\n'), reg, M68K_GETPC);

		compute_passed_time ();

		switch (reg) {
		case 0:
			//if (currprefs.use_serial)
			tmp = AMIGA.serial.readStatus(ciabdra);
/*#ifdef PARALLEL_PORT
			if (isprinter () > 0) {
				//tmp |= ciabpra & (0x04 | 0x02 | 0x01);
				tmp &= ~3; // clear BUSY and PAPEROUT
				tmp |= 4; // set SELECT
			} else if (isprinter () < 0) {
				uae_u8 v;
				parallel_direct_read_status (&v);
				tmp |= v & 7;
			} else
#endif*/
			{
				tmp |= handle_parport_joystick(1, ciabpra, ciabdra);
				//tmp = dongle_cia_read (1, reg, tmp);
				//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD000 R %02X %s\n'), tmp, debuginfo(0));
			}
			return tmp;
		case 1:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD100 R %02X %s\n'), ciabprb, debuginfo(0));
			tmp = ciabprb;
			//tmp = dongle_cia_read(1, reg, tmp);
			if (ciabcrb & 2) {
				var pb7 = 0;
				if (ciabcrb & 4)
					pb7 = ciabcrb & 1;
				tmp &= ~0x80;
				tmp |= pb7 ? 0x80 : 0;
			}
			if (ciabcra & 2) {
				var pb6 = 0;
				if (ciabcra & 4)
					pb6 = ciabcra & 1;
				tmp &= ~0x40;
				tmp |= pb6 ? 0x40 : 0;
			}
			return tmp;
		case 2:
			return ciabdra;
		case 3:
			return ciabdrb;
		case 4:
			return (ciabta - ciabta_passed) & 0xff;
		case 5:
			return ((ciabta - ciabta_passed) >> 8) & 0xff;
		case 6:
			return (ciabtb - ciabtb_passed) & 0xff;
		case 7:
			return ((ciabtb - ciabtb_passed) >> 8) & 0xff;
		case 8:
			if (ciabtlatch) {
				ciabtlatch = 0;
				return ciabtol & 0xff;
			} else
				return ciabtod & 0xff;
		case 9:
			if (ciabtlatch)
				return (ciabtol >> 8) & 0xff;
			else
				return (ciabtod >> 8) & 0xff;
		case 10:
			if (!ciabtlatch) {
				if (!(ciabcrb & 0x80))
					ciabtlatch = 1;
				ciabtol = ciabtod;
			}
			return (ciabtol >> 16) & 0xff;
		case 12:
			return ciabsdr;
		case 13:
			tmp = ciabicr_reg;
			ciabicr &= ~ciabicr_reg;
			ciabicr_reg = 0;
			RethinkICRB();
			return tmp;
		case 14:
			//write_log (_T('CIABCRA READ %d %x\n'), ciabcra, M68K_GETPC);
			return ciabcra;
		case 15:
			return ciabcrb;
		}
		return 0;
	}

	function WriteCIAA(addr, val) {
		var reg = addr & 15;

		//if (CIAA_DEBUG_W) write_log (_T('W_CIAA: bfe%x01 %02X %08X\n'), reg, val, M68K_GETPC);

		/*if (!currprefs.cs_ciaoverlay && oldovl) {
			map_overlay (1);
			oldovl = 0;
		}*/
		switch (reg) {
		case 0:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE001 W %02X %s\n'), val, debuginfo(0));
			ciaapra = (ciaapra & ~0xc3) | (val & 0xc3);
			bfe001_change();
			//handle_cd32_joystick_cia(ciaapra, ciaadra);
			//dongle_cia_write (0, reg, val);
			break;
		case 1:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE101 W %02X %s\n'), val, debuginfo(0));
			ciaaprb = val;
			//dongle_cia_write (0, reg, val);
/*#ifdef PARALLEL_PORT
			if (isprinter() > 0) {
				doprinter (val);
				this.parallelack();
			} else if (isprinter() < 0) {
				parallel_direct_write_data (val, ciaadrb);
				this.parallelack();
			}
#endif*/
			break;
		case 2:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE201 W %02X %s\n'), val, debuginfo(0));
			ciaadra = val;
			//dongle_cia_write (0, reg, val);
			bfe001_change();
			break;
		case 3:
			ciaadrb = val;
			//dongle_cia_write (0, reg, val);
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFE301 W %02X %s\n'), val, debuginfo(0));
			break;
		case 4:
			CIA_update();
			ciaala = (ciaala & 0xff00) | val;
			CIA_calctimers();
			break;
		case 5:
			CIA_update();
			ciaala = (ciaala & 0xff) | (val << 8);
			if ((ciaacra & 1) == 0)
				ciaata = ciaala;
			if (ciaacra & 8) {
				ciaata = ciaala;
				ciaacra |= 1;
				ciaastarta = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 6:
			CIA_update();
			ciaalb = (ciaalb & 0xff00) | val;
			CIA_calctimers();
			break;
		case 7:
			CIA_update();
			ciaalb = (ciaalb & 0xff) | (val << 8);
			if ((ciaacrb & 1) == 0)
				ciaatb = ciaalb;
			if (ciaacrb & 8) {
				ciaatb = ciaalb;
				ciaacrb |= 1;
				ciaastartb = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 8:
			if (ciaacrb & 0x80) {
				ciaaalarm = (ciaaalarm & ~0xff) | val;
			} else {
				ciaatod = (ciaatod & ~0xff) | val;
				ciaatodon = 1;
				ciaa_checkalarm(0);
			}
			break;
		case 9:
			if (ciaacrb & 0x80) {
				ciaaalarm = (ciaaalarm & ~0xff00) | (val << 8);
			} else {
				ciaatod = (ciaatod & ~0xff00) | (val << 8);
			}
			break;
		case 10:
			if (ciaacrb & 0x80) {
				ciaaalarm = (ciaaalarm & ~0xff0000) | (val << 16);
			} else {
				ciaatod = (ciaatod & ~0xff0000) | (val << 16);
				ciaatodon = 0;
			}
			break;
		case 12:
			CIA_update();
			ciaasdr = val;
			if ((ciaacra & 0x41) == 0x41 && ciaasdr_cnt == 0)
				ciaasdr_cnt = 8 * 2;
			CIA_calctimers();
			break;
		case 13:
			setclra(val);
			break;
		case 14:
			CIA_update();
			val &= 0x7f; /* bit 7 is unused */
			if ((val & 1) && !(ciaacra & 1))
				ciaastarta = CIASTARTCYCLESCRA;
			if ((val & 0x40) == 0 && (ciaacra & 0x40) != 0) {
				AMIGA.input.keyboard.lostsynccnt = 0;
				//if (KB_DEBUG) BUG.info('KB_ACK %02x->%02x', ciaacra, val);
			}
			ciaacra = val;
			if (ciaacra & 0x10) {
				ciaacra &= ~0x10;
				ciaata = ciaala;
			}
			CIA_calctimers();
			break;
		case 15:
			CIA_update();
			if ((val & 1) && !(ciaacrb & 1))
				ciaastartb = CIASTARTCYCLESCRA;
			ciaacrb = val;
			if (ciaacrb & 0x10) {
				ciaacrb &= ~0x10;
				ciaatb = ciaalb;
			}
			CIA_calctimers();
			break;
		}
	}

	function WriteCIAB(addr, val)	{
		var reg = addr & 15;

		//if ((addr >= 8 && addr <= 10) || CIAB_DEBUG_W > 1) write_log (_T('W_CIAB: bfd%x00 %02X %08X\n'), reg, val, M68K_GETPC);
		switch (reg) {
		case 0:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD000 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabpra = val;
			//if (currprefs.use_serial)
			AMIGA.serial.writeStatus(ciabpra, ciabdra);
/*#ifdef PARALLEL_PORT
			if (isprinter () < 0)
				parallel_direct_write_status (val, ciabdra);
#endif*/
			break;
		case 1:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD100 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabprb = val;
			AMIGA.disk.select(val);
			break;
		case 2:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD200 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabdra = val;
			//if (currprefs.use_serial)
			AMIGA.serial.writeStatus(ciabpra, ciabdra);
			break;
		case 3:
			//if (DONGLE_DEBUG && notinrom()) write_log (_T('BFD300 W %02X %s\n'), val, debuginfo(0));
			//dongle_cia_write (1, reg, val);
			ciabdrb = val;
			break;
		case 4:
			CIA_update();
			ciabla = (ciabla & 0xff00) | val;
			CIA_calctimers();
			break;
		case 5:
			CIA_update();
			ciabla = (ciabla & 0xff) | (val << 8);
			if ((ciabcra & 1) == 0)
				ciabta = ciabla;
			if (ciabcra & 8) {
				ciabta = ciabla;
				ciabcra |= 1;
				ciabstarta = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 6:
			CIA_update();
			ciablb = (ciablb & 0xff00) | val;
			CIA_calctimers();
			break;
		case 7:
			CIA_update();
			ciablb = (ciablb & 0xff) | (val << 8);
			if ((ciabcrb & 1) == 0)
				ciabtb = ciablb;
			if (ciabcrb & 8) {
				ciabtb = ciablb;
				ciabcrb |= 1;
				ciabstartb = CIASTARTCYCLESHI;
			}
			CIA_calctimers();
			break;
		case 8:
			if (ciabcrb & 0x80) {
				ciabalarm = (ciabalarm & ~0xff) | val;
			} else {
				ciabtod = (ciabtod & ~0xff) | val;
				ciabtodon = 1;
				ciab_checkalarm (0);
			}
			break;
		case 9:
			if (ciabcrb & 0x80) {
				ciabalarm = (ciabalarm & ~0xff00) | (val << 8);
			} else {
				ciabtod = (ciabtod & ~0xff00) | (val << 8);
			}
			break;
		case 10:
			if (ciabcrb & 0x80) {
				ciabalarm = (ciabalarm & ~0xff0000) | (val << 16);
			} else {
				ciabtod = (ciabtod & ~0xff0000) | (val << 16);
				ciabtodon = 0;
			}
			break;
		case 12:
			CIA_update();
			ciabsdr = val;
			if ((ciabcra & 0x40) == 0)
				ciabsdr_cnt = 0;
			if ((ciabcra & 0x41) == 0x41 && ciabsdr_cnt == 0)
				ciabsdr_cnt = 8 * 2;
			CIA_calctimers();
			break;
		case 13:
			setclrb(val);
			break;
		case 14:
			CIA_update();
			val &= 0x7f; /* bit 7 is unused */
			if ((val & 1) && !(ciabcra & 1))
				ciabstarta = CIASTARTCYCLESCRA;
			ciabcra = val;
			if (ciabcra & 0x10) {
				ciabcra &= ~0x10;
				ciabta = ciabla;
			}
			CIA_calctimers();
			break;
		case 15:
			CIA_update();
			if ((val & 1) && !(ciabcrb & 1))
				ciabstartb = CIASTARTCYCLESCRA;
			ciabcrb = val;
			if (ciabcrb & 0x10) {
				ciabcrb &= ~0x10;
				ciabtb = ciablb;
			}
			CIA_calctimers();
			break;
		}
	}

	this.setup = function () {
	};

	this.reset = function () {
		if (TOD_HACK) {
			tod_hack_tv = 0;
			tod_hack_tod = 0;
			tod_hack_enabled = 0;
			if (AMIGA.config.cia.tod_hack)
				tod_hack_enabled = TOD_HACK_TIME;
		}
		//kblostsynccnt = 0;
		//serbits = 0;
		//oldcd32mute = 1;
		oldled = true;
		//resetwarning_phase = resetwarning_timer = 0;
		//heartbeat_cnt = 0;

		//oldovl = true;
		//kbstate = 0;
		ciaatlatch = ciabtlatch = 0;
		ciaapra = 0;
		ciaadra = 0;
		ciaatod = ciabtod = 0;
		ciaatodon = ciabtodon = 0;
		ciaaicr = ciabicr = ciaaimask = ciabimask = 0;
		ciaacra = ciaacrb = ciabcra = ciabcrb = 0x4;
		/* outmode = toggle; */
		ciaala = ciaalb = ciabla = ciablb = ciaata = ciaatb = ciabta = ciabtb = 0xFFFF;
		ciaaalarm = ciabalarm = 0;
		ciabpra = 0x8C;
		ciabdra = 0;
		div10 = 0;
		ciaasdr_cnt = 0;
		ciaasdr = 0;
		ciabsdr_cnt = 0;
		ciabsdr = 0;
		ciaata_passed = ciaatb_passed = ciabta_passed = ciabtb_passed = 0;

		CIA_calctimers();
		AMIGA.disk.select_set(ciabprb);

		//map_overlay (0);

		//if (currprefs.use_serial) serial_dtr_off (); NI /* Drop DTR at reset */
	};

	this.dump = function () {
		BUG.info('A: CRA %02x CRB %02x ICR %02x IM %02x TA %04x (%04x) TB %04x (%04x)', ciaacra, ciaacrb, ciaaicr, ciaaimask, ciaata, ciaala, ciaatb, ciaalb);
		BUG.info('TOD %06x (%06x) ALARM %06x %s%s CYC=%.1f', ciaatod, ciaatol, ciaaalarm, ciaatlatch ? 'L' : ' ', ciaatodon ? ' ' : 'S', AMIGA.events.currcycle * CYCLE_UNIT_INV);
		BUG.info('B: CRA %02x CRB %02x ICR %02x IM %02x TA %04x (%04x) TB %04x (%04x)', ciabcra, ciabcrb, ciabicr, ciabimask, ciabta, ciabla, ciabtb, ciablb);
		BUG.info('TOD %06x (%06x) ALARM %06x %s%s CLK=%.1f', ciabtod, ciabtol, ciabalarm, ciabtlatch ? 'L' : ' ', ciabtodon ? ' ' : 'S', div10 * CYCLE_UNIT_INV);
	};

	// Gayle or Fat Gary does not enable CIA /CS lines if both CIAs are selected
	// Old Gary based Amigas enable both CIAs in this situation
	function issinglecia() {
		return false; //currprefs.cs_ide || currprefs.cs_pcmcia || currprefs.cs_mbdmac;
	}
	function isgayle() {
		return false; //currprefs.cs_ide || currprefs.cs_pcmcia;
	}

	function cia_wait_pre() {
		if (!CUSTOM_SIMPLE) {
			var div = (AMIGA.events.currcycle - AMIGA.events.eventtab[EV_CIA].oldcycles) % DIV10;
			var tmp = Math.floor(DIV10 * ECLOCK_DATA_CYCLE / 10);
			var cycles;

			if (div >= tmp)
				cycles = DIV10 - div + tmp;
			else if (div)
				cycles = DIV10 + tmp - div;
			else
				cycles = tmp - div;

			if (cycles)
				AMIGA.events.cycle(cycles);
		}
	}

	function cia_wait_post(value) {
		AMIGA.events.cycle(6 * CYCLE_UNIT / 2);
	}

	function isgaylenocia(addr) {
		// gayle CIA region is only 4096 bytes at 0xbfd000 and 0xbfe000
		if (!isgayle())
			return true;
		var mask = addr & 0xf000;
		return mask == 0xe000 || mask == 0xd000;
	}

	this.load8 = function (addr) {
		var r = (addr & 0xf00) >> 8;
		var v = 0xff;

		if (!isgaylenocia(addr))
			return v;

		cia_wait_pre();
		switch ((addr >> 12) & 3) {
			case 0:
				if (!issinglecia())
					v = (addr & 1) ? ReadCIAA(r) : ReadCIAB(r);
				break;
			case 1:
				v = (addr & 1) ? 0xff : ReadCIAB(r);
				break;
			case 2:
				v = (addr & 1) ? ReadCIAA(r) : 0xff;
				break;
			case 3:
			{
				//if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible) v = (addr & 1) ? regs.irc : regs.irc >> 8;
				if (warned > 0) {
					BUG.info('cia_bget: unknown CIA address %x', addr);
					warned--;
				}
				break;
			}
		}
		cia_wait_post(v);
		return v;
	};

	this.load16 = function (addr) {
		var r = (addr & 0xf00) >> 8;
		var v = 0xffff;

		if (!isgaylenocia(addr))
			return v;

		cia_wait_pre();
		switch ((addr >> 12) & 3) {
			case 0:
				if (!issinglecia())
					v = (ReadCIAB(r) << 8) | ReadCIAA(r);
				break;
			case 1:
				v = (ReadCIAB(r) << 8) | 0xff;
				break;
			case 2:
				v = (0xff << 8) | ReadCIAA(r);
				break;
			case 3:
			{
				//if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible) v = regs.irc;
				if (warned > 0) {
					BUG.info('cia_wget: unknown CIA address %x', addr);
					warned--;
				}
				break;
			}
		}
		cia_wait_post(v);
		return v;
	};

	this.load32 = function (addr) {
		var v = this.load16(addr) << 16;
		v |= this.load16(addr + 2);
		return v >>> 0;
	};

	this.store8 = function (addr, value) {
		var r = (addr & 0xf00) >> 8;

		if (!isgaylenocia(addr))
			return;

		cia_wait_pre();
		if (!issinglecia() || (addr & 0x3000) != 0) {
			if ((addr & 0x2000) == 0)
				WriteCIAB(r, value);
			if ((addr & 0x1000) == 0)
				WriteCIAA(r, value);
			if (((addr & 0x3000) == 0x3000) && warned > 0) {
				BUG.info('cia_bput: unknown CIA address %x %x', addr, value);
				warned--;
			}
		}
		cia_wait_post(value);
	};

	this.store16 = function (addr, value) {
		var r = (addr & 0xf00) >> 8;

		if (!isgaylenocia(addr))
			return;

		cia_wait_pre();
		if (!issinglecia() || (addr & 0x3000) != 0) {
			if ((addr & 0x2000) == 0)
				WriteCIAB(r, value >> 8);
			if ((addr & 0x1000) == 0)
				WriteCIAA(r, value & 0xff);
			if (((addr & 0x3000) == 0x3000) && warned > 0) {
				BUG.info('cia_wput: unknown CIA address %x %x', addr, value);
				warned--;
			}
		}
		cia_wait_post(value);
	};

	this.store32 = function (addr, value) {
		this.store16(addr, value >> 16);
		this.store16(addr + 2, value & 0xffff);
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Config() {
	this.init = false;

	this.cpu = {
		model: 0,
		speed: 0,
		compatible: false
	};
	this.blitter = {
		immediate: false,
		waiting: 0
	};
	this.chipset = {
		mask: 0,
		agnus_dip: 0,
		agnus_rev: 0,
		denise_rev: 0,
		collision_level: 0,
		genlock: false,
		refreshrate: 0
	};
	this.ram = {
		chip: {
			size: 0
		},
		slow: {
			size: 0
		},
		fast: {
			size: 0
		}
	};
	this.rom = {
		size: 0,
		data: null
	};
	this.ext = {
		addr: 0,
		size: 0,
		data: null
	};
	this.floppy = {
		drive:[{
			type: 0,
			name: null,
			data: null
		}, {
			type: 0,
			name: null,
			data: null
		}, {
			type: 0,
			name: null,
			data: null
		}, {
			type: 0,
			name: null,
			data: null
		}],
		speed:0
	};		
	this.video = {
		id: '',		
		enabled: false,
		scale: false,
		ntsc: false, //~
		framerate: 0,
		hresolution: 0,
		vresolution: 0,
		scandoubler: false,	
		scanlines: false,
		extrawidth: 0,
		xcenter: 0,
		ycenter: 0  
	};
	this.audio = {
		enabled: false,
		mode:0,
		channels: 0,
		filter: false
	};
	this.ports = [{
		type: 0,
		move: 0,
		fire: [0,0]		
	}, {
		type: 0,
		move: 0,
		fire: [0,0]				
	}];
	this.keyboard = {
		enabled: false,
		mapShift: false
	};
	this.serial = {
		enabled: false
	};
	this.rtc = {
		type: 0
	};
	this.cia = {
		tod: 0,
		tod_hack: 0
	};
	this.hooks = {
		error: null,
		power_led: null,
		floppy_motor: null,
		floppy_step: null,
		fps: null,
		cpu: null
	};

	function configSetDefaults(c) {
		c.init = true;

		c.cpu.model = 68000;
		c.cpu.speed = SAEV_Config_CPU_Speed_Original;
		c.cpu.compatible = false;

		//c.chipset.mask = CSMASK_ECS_AGNUS | CSMASK_ECS_DENISE;
		//c.chipset.mask = CSMASK_ECS_AGNUS;
		c.chipset.mask = 0;
		c.chipset.agnus_dip = false; /* A1000 */
		c.chipset.agnus_rev = -1;
		c.chipset.denise_rev = -1;
		c.chipset.collision_level = SAEV_Config_Chipset_ColLevel_None;
		c.chipset.genlock = false;
		c.chipset.refreshrate = -1;
		
		c.blitter.immediate = 0 ? true : false;
		c.blitter.waiting = 1; /* 0 if blitter.immediate */ 
		
		c.ram.chip.size = SAEV_Config_RAM_Chip_Size_512K;
		c.ram.slow.size = SAEV_Config_RAM_Slow_Size_512K;
		c.ram.fast.size = SAEV_Config_RAM_Fast_Size_1M;

		c.rom.size = SAEV_Config_ROM_Size_None;
		c.rom.data = null;
		c.ext.addr = SAEV_Config_EXT_Addr_E0;
		c.ext.size = SAEV_Config_EXT_Size_None;
		c.ext.data = null;

		c.floppy.drive[0].type = SAEV_Config_Floppy_Type_35_DD;
		c.floppy.drive[0].name = null;						
		c.floppy.drive[0].data = null;						
		c.floppy.drive[1].type = SAEV_Config_Floppy_Type_35_DD;
		c.floppy.drive[1].name = null;						
		c.floppy.drive[1].data = null;						
		c.floppy.drive[2].type = SAEV_Config_Floppy_Type_None;
		c.floppy.drive[2].name = null;						
		c.floppy.drive[2].data = null;						
		c.floppy.drive[3].type = SAEV_Config_Floppy_Type_None;
		c.floppy.drive[3].name = null;						
		c.floppy.drive[3].data = null;						
		c.floppy.speed = SAEV_Config_Floppy_Speed_Original;						

		c.video.id = 'video';
		c.video.enabled = true;
		c.video.scale = false;
		c.video.ntsc = false;
		c.video.framerate = 1; //2
		c.video.hresolution = 1 ? RES_HIRES : RES_LORES;
		c.video.vresolution = 1 ? VRES_DOUBLE : VRES_NONDOUBLE;
		c.video.scandoubler = 0 ? true : false;	
		c.video.scanlines = 0 ? true : false;
		c.video.extrawidth = 0;
		c.video.xcenter = 0;
		c.video.ycenter = 0;
	
		c.audio.enabled = true;
		//c.audio.mode = SAEV_Config_Audio_Mode_Play_Best;
		c.audio.mode = SAEV_Config_Audio_Mode_Play;
		c.audio.channels = SAEV_Config_Audio_Channels_Stereo;
		c.audio.filter = false;

		c.ports[0].type = SAEV_Config_Ports_Type_Mouse;
		c.ports[0].move = SAEV_Config_Ports_Move_WASD;
		c.ports[0].fire[0] = 49;
		c.ports[0].fire[1] = 50;
		c.ports[1].type = SAEV_Config_Ports_Type_Joy1;
		c.ports[1].move = SAEV_Config_Ports_Move_Arrows;
		c.ports[1].fire[0] = 16;
		c.ports[1].fire[1] = 17;

		c.keyboard.enabled = true;
		c.keyboard.mapShift = false;

		c.rtc.type = 1 ? SAEV_Config_RTC_Type_MSM6242B : SAEV_Config_RTC_Type_RF5C01A; 
		  
		c.cia.tod = 0;   
		c.cia.tod_hack = true;   

		c.hooks.error = function (err, msg) {
		};
		c.hooks.power_led = function (on) {
		};
		c.hooks.floppy_motor = function (unit, on) {
		};
		c.hooks.floppy_step = function (unit, cyl) {
		};
		c.hooks.fps = function (fps) {
		};
		c.hooks.cpu = function(usage) {}	
	}
	configSetDefaults(this);
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

const SAEV_Version = 0;
const SAEV_Revision = 8;
const SAEV_Revision_Sub = 2;

/*-----------------------------------------------------------------------*/
/* info */

const SAEI_Audio_WebAudio = 1;

const SAEI_Video_Canvas2D = 1;
const SAEI_Video_WebGL = 2;

/*-----------------------------------------------------------------------*/
/* cpu */

const SAEV_Config_CPU_Speed_Maximum = -1;
const SAEV_Config_CPU_Speed_Original = 0;

/*-----------------------------------------------------------------------*/
/* chipset */

const SAEV_Config_Chipset_Type_OCS = 1;
const SAEV_Config_Chipset_Type_ECS_AGNUS = 2;
const SAEV_Config_Chipset_Type_ECS_DENISE = 3;

const SAEV_Config_Chipset_Mask_OCS = 0;
const SAEV_Config_Chipset_Mask_ECS_AGNUS = 1;
const SAEV_Config_Chipset_Mask_ECS_DENISE = 1 | 2;


const SAEV_Config_Chipset_ColLevel_None = 0;
const SAEV_Config_Chipset_ColLevel_Sprite_Sprite = 1;
const SAEV_Config_Chipset_ColLevel_Sprite_Playfield = 2;
const SAEV_Config_Chipset_ColLevel_Full = 3;

/*-----------------------------------------------------------------------*/
/* ram */

const SAEV_Config_RAM_Chip_Size_256K = 1;
const SAEV_Config_RAM_Chip_Size_512K = 2;
const SAEV_Config_RAM_Chip_Size_1M = 3;
const SAEV_Config_RAM_Chip_Size_2M = 4;

const SAEV_Config_RAM_Slow_Size_None = 0;
const SAEV_Config_RAM_Slow_Size_256K = 1;
const SAEV_Config_RAM_Slow_Size_512K = 2;
const SAEV_Config_RAM_Slow_Size_1M = 3;
const SAEV_Config_RAM_Slow_Size_1536K = 4;

const SAEV_Config_RAM_Fast_Size_None = 0;
const SAEV_Config_RAM_Fast_Size_512K = 1;
const SAEV_Config_RAM_Fast_Size_1M = 2;
const SAEV_Config_RAM_Fast_Size_2M = 3;
const SAEV_Config_RAM_Fast_Size_4M = 4;
const SAEV_Config_RAM_Fast_Size_8M = 5;

/*-----------------------------------------------------------------------*/
/* rom, ext */

const SAEV_Config_ROM_Size_None = 0;
const SAEV_Config_ROM_Size_256K = 1;
const SAEV_Config_ROM_Size_512K = 2;

const SAEV_Config_EXT_Size_None = 0;
const SAEV_Config_EXT_Size_256K = 1;
const SAEV_Config_EXT_Size_512K = 2;

//const SAEV_Config_EXT_Addr_A0 = 1;
const SAEV_Config_EXT_Addr_E0 = 2;
const SAEV_Config_EXT_Addr_F0 = 3;

/*-----------------------------------------------------------------------*/
/* disk */

const SAEV_Config_Floppy_Type_None = 0;
const SAEV_Config_Floppy_Type_35_DD = 1;
const SAEV_Config_Floppy_Type_35_HD = 2;
const SAEV_Config_Floppy_Type_525_SD = 3;

const SAEV_Config_Floppy_Speed_Turbo = 0;
const SAEV_Config_Floppy_Speed_Original = 100;

/*-----------------------------------------------------------------------*/
/* audio */

const SAEV_Config_Audio_Mode_Emul = 0;
const SAEV_Config_Audio_Mode_Play = 1;
const SAEV_Config_Audio_Mode_Play_Best = 2;

const SAEV_Config_Audio_Channels_Mono = 1;
const SAEV_Config_Audio_Channels_Stereo = 2;

/*-----------------------------------------------------------------------*/
/* input */

const SAEV_Config_Ports_Type_None = 0;
const SAEV_Config_Ports_Type_Mouse = 1;
const SAEV_Config_Ports_Type_Joy0 = 2;
const SAEV_Config_Ports_Type_Joy1 = 3;

const SAEV_Config_Ports_Move_None = 0;
const SAEV_Config_Ports_Move_Arrows = 1;
const SAEV_Config_Ports_Move_Numpad = 2;
const SAEV_Config_Ports_Move_WASD = 3;

const SAEV_Config_Ports_Fire_None = 0;

/*-----------------------------------------------------------------------*/
/* rtc */

const SAEV_Config_RTC_Type_None = 0;
const SAEV_Config_RTC_Type_MSM6242B = 1;
const SAEV_Config_RTC_Type_RF5C01A = 2;

/*-----------------------------------------------------------------------*/
/* erros */

//const SAEE_None = 0;

const SAEE_CPU_Internal = 1;
const SAEE_CPU_68020_Required = 2;

const SAEE_Disk_File_Too_Big = 3;

const SAEE_Video_Shader_Error = 4;
const SAEE_Video_ID_Not_Found = 5;
const SAEE_Video_Canvas_Not_Supported = 6;
//const SAEE_Video_WebGL_Not_Avail = 7;

const SAEE_Audio_WebAudio_Not_Avail = 8;

/*-----------------------------------------------------------------------*/
/* methods */

/*const SAEM_Init = 1;
const SAEM_Start = 2;
const SAEM_Stop = 3;
const SAEM_Pause = 4;
const SAEM_Reset = 5;
const SAEM_Insert = 6;
const SAEM_Eject = 7;*/

/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/
/* amiga */

const ST_STOP  = 0;
const ST_CYCLE = 1;
const ST_PAUSE = 2;
const ST_IDLE  = 3;

/*-----------------------------------------------------------------------*/
/* events */

const EV_CIA     = 0;
const EV_AUDIO   = 1;
const EV_MISC    = 2;
const EV_HSYNC   = 3;
const EV_MAX     = 4;

const EV2_BLITTER = 0;
const EV2_DISK    = 1;
const EV2_DMAL    = 2;
const EV2_MISC    = 3;
const EV2_MAX     = 3 + 10;

const CYCLE_UNIT = 512;
const CYCLE_UNIT_INV = 1.0 / CYCLE_UNIT; /* mul is always faster than div */

const CYCLE_MAX = 0xffffffff * CYCLE_UNIT;

/*-----------------------------------------------------------------------*/
/* cpu */

const SPCFLAG_STOP = 2;
const SPCFLAG_COPPER = 4;
const SPCFLAG_INT = 8;
//const SPCFLAG_BRK = 16;
const SPCFLAG_TRACE = 64;
const SPCFLAG_DOTRACE = 128;
const SPCFLAG_DOINT = 256; 
const SPCFLAG_BLTNASTY = 512;
const SPCFLAG_TRAP = 1024;

/*-----------------------------------------------------------------------*/
/* amiga */

const INTF_TBE		= 1 << 0;
const INTF_DSKBLK	= 1 << 1;
const INTF_PORTS	= 1 << 3;
const INTF_COPER	= 1 << 4;
const INTF_VERTB	= 1 << 5;
const INTF_BLIT	= 1 << 6;
const INTF_AUD0	= 1 << 7;
const INTF_AUD1	= 1 << 8;
const INTF_AUD2	= 1 << 9;
const INTF_AUD3	= 1 << 10;
const INTF_RBF		= 1 << 11;
const INTF_DSKSYN	= 1 << 12;
const INTF_EXTER	= 1 << 13;
const INTF_INTEN	= 1 << 14;
const INTF_SETCLR	= 1 << 15;

const INT_DSKBLK	= INTF_SETCLR | INTF_DSKBLK;
const INT_VERTB	= INTF_SETCLR | INTF_VERTB;
const INT_BLIT		= INTF_SETCLR | INTF_BLIT;
const INT_DSKSYN	= INTF_SETCLR | INTF_DSKSYN;

const DMAF_AUD0EN	= 1 << 0;
const DMAF_AUD1EN	= 1 << 1;
const DMAF_AUD2EN	= 1 << 2;
const DMAF_AUD3EN	= 1 << 3;
const DMAF_DSKEN	= 1 << 4;
const DMAF_SPREN	= 1 << 5;
const DMAF_BLTEN	= 1 << 6;
const DMAF_COPEN	= 1 << 7;
const DMAF_BPLEN	= 1 << 8;
const DMAF_DMAEN	= 1 << 9;
const DMAF_BLTPRI	= 1 << 10;
const DMAF_BZERO	= 1 << 13;
const DMAF_BBUSY	= 1 << 14;
const DMAF_SETCLR	= 1 << 15;

/*-----------------------------------------------------------------------*/
/* blitter  */

const BLT_done = 0;
const BLT_init = 1;
const BLT_read = 2;
const BLT_work = 3;
const BLT_write = 4;
const BLT_next = 5;

/*-----------------------------------------------------------------------*/
/* video  */

const VIDEO_WIDTH = 720; /* == 360*2 */
const VIDEO_HEIGHT = 568; /* == 284*2 */
const VIDEO_DEPTH = 32; 

/*-----------------------------------------------------------------------*/
/* audio */

const PERIOD_MIN = 4;
const PERIOD_MIN_NONCE = 60;
const PERIOD_MAX = 0xffffffff * CYCLE_UNIT;

/*-----------------------------------------------------------------------*/
/* playfield, sprites */

const CUSTOM_SIMPLE = 0;
const SMART_UPDATE = 0;

const MAXHPOS = 227;
const MAXHPOS_PAL = 227;
const MAXHPOS_NTSC = 227;
const MAXVPOS = 312;
const MAXVPOS_PAL = 312;
const MAXVPOS_NTSC = 262;
const VBLANK_ENDLINE_PAL = 26;
const VBLANK_ENDLINE_NTSC = 21;
const VBLANK_SPRITE_PAL = 25;
const VBLANK_SPRITE_NTSC = 20;
const VBLANK_HZ_PAL = 50;
const VBLANK_HZ_NTSC = 60;
const EQU_ENDLINE_PAL = 8;
const EQU_ENDLINE_NTSC = 10;

const CSMASK_ECS_AGNUS = 1;
const CSMASK_ECS_DENISE = 2;
const CSMASK_AGA = 4;
//const CSMASK_MASK = (CSMASK_ECS_AGNUS | CSMASK_ECS_DENISE | CSMASK_AGA);

const CHIPSET_CLOCK_PAL  = 3546895;
const CHIPSET_CLOCK_NTSC = 3579545;

const RES_LORES		= 0;
const RES_HIRES		= 1;
const RES_SUPERHIRES	= 2;
const RES_MAX			= 2;

const VRES_NONDOUBLE	= 0;
const VRES_DOUBLE		= 1;
const VRES_QUAD		= 2;
const VRES_MAX			= 1;

const DIW_WAITING_START	= 0;
const DIW_WAITING_STOP	= 1;

const LINE_UNDECIDED						= 1;
const LINE_DECIDED						= 2;
const LINE_DECIDED_DOUBLE				= 3;
const LINE_AS_PREVIOUS					= 4;
const LINE_BLACK							= 5;
const LINE_REMEMBERED_AS_BLACK		= 6;
const LINE_DONE							= 7;
const LINE_DONE_AS_PREVIOUS			= 8;
const LINE_REMEMBERED_AS_PREVIOUS	= 9;

const LOF_TOGGLES_NEEDED = 4;
const NLACE_CNT_NEEDED = 50;

const HARD_DDF_STOP = 0xd4;
const HARD_DDF_START = 0x18;

const MAX_PLANES = 6; /* 8 = AGA */

const AMIGA_WIDTH_MAX = 752 / 2;
//const AMIGA_HEIGHT_MAX = 574 / 2;

const DIW_DDF_OFFSET = 1;
const HBLANK_OFFSET = 9;
const DISPLAY_LEFT_SHIFT = 0x38;

const NLN_NORMAL	= 0;
const NLN_DOUBLED	= 1;
const NLN_UPPER	= 2;
const NLN_LOWER	= 3;
const NLN_NBLACK	= 4;

const PLF_IDLE				= 0;
const PLF_START			= 1;
const PLF_ACTIVE			= 2;
const PLF_PASSED_STOP	= 3;
const PLF_PASSED_STOP2	= 4;
const PLF_END				= 5;

const FETCH_NOT_STARTED	= 0;
const FETCH_STARTED		= 1;
const FETCH_WAS_PLANE0	= 2;

const COLOR_TABLE_SIZE = (MAXVPOS + 2) * 2;  
const COLOR_CHANGE_BRDBLANK = 0x80000000;

const BPLCON_DENISE_DELAY = 1;

//const SPRITE_DEBUG = 0;
//const SPRITE_DEBUG_MINY = 0x0;
//const SPRITE_DEBUG_MAXY = 0x100;
//const AUTOSCALE_SPRITES = 1;
//const SPRBORDER = 0;
const SPR0_HPOS = 0x15;
const MAX_SPRITES = 8;

const MAX_PIXELS_PER_LINE = 1760;

const MAX_SPR_PIXELS = (((MAXVPOS + 1) * 2 + 1) * MAX_PIXELS_PER_LINE);
const MAX_REG_CHANGE = ((MAXVPOS + 1) * 2 * MAXHPOS);

const MAX_STOP = 30000;
const NO_BLOCK = -3;

const MAX_WORDS_PER_LINE = 100;

const DO_SPRITES = 1;
const FAST_COLORS = 0;

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

//copper_states
const COP_stop = 0;
const COP_waitforever = 1;
const COP_read1 = 2;
const COP_read2 = 3;
const COP_bltwait = 4;
const COP_wait_in2 = 5;
const COP_skip_in2 = 6;
const COP_wait1 = 7;
const COP_wait = 8;
const COP_skip1 = 9;
const COP_strobe_delay1 = 10;
const COP_strobe_delay2 = 11;
const COP_strobe_delay1x = 12;
const COP_strobe_delay2x = 13;
const COP_strobe_extra = 14;
const COP_start_delay = 15;

function Copper() {
	const customdelay = [
		1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,0,0,0,0, /* 32 0x00 - 0x3e */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 0x40 - 0x5e */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 0x60 - 0x7e */
		0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0, /* 0x80 - 0x9e */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, /* 32 0xa0 - 0xde */
		/* BPLxPTH/BPLxPTL */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 16 */
		/* BPLCON0-3,BPLMOD1-2 */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, /* 16 */
		/* SPRxPTH/SPRxPTL */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, /* 16 */
		/* SPRxPOS/SPRxCTL/SPRxDATA/SPRxDATB */
		1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
		/* COLORxx */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
		/* RESERVED */
		0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	];
	this.cop1lc = 0;
	this.cop2lc = 0;
	this.copcon = 0;
	this.enabled_thisline = false;
	this.access = false;
	this.last_copper_hpos = 0;

	var cop_state = {
		/* The current instruction words.  */
		i1:0, i2:0,
		saved_i1:0, saved_i2:0,
		state:0, state_prev:0,
		/* Instruction pointer.  */
		ip:0, saved_ip:0,
		hpos:0, vpos:0,
		ignore_next:0,
		vcmp:0, hcmp:0,

		strobe:0, /* COPJMP1 / COPJMP2 accessed */
		last_write:0, last_write_hpos:0,
		moveaddr:0, movedata:0, movedelay:0
	};

	this.reset = function () {
		this.copcon = 0;
		cop_state.state = COP_stop;
	};

	this.reset2 = function () {
		cop_state.hpos = 0;
		cop_state.last_write = 0;
		this.compute_spcflag_copper(AMIGA.playfield.maxhpos);
	};

	this.COPCON = function (v) {
		this.copcon = v;
	};
	this.COP1LCH = function (v) {
		this.cop1lc = ((v << 16) | (this.cop1lc & 0xffff)) >>> 0;
	};
	this.COP1LCL = function (v) {
		this.cop1lc = ((this.cop1lc & 0xffff0000) | (v & 0xfffe)) >>> 0;
	};
	this.COP2LCH = function (v) {
		this.cop2lc = ((v << 16) | (this.cop2lc & 0xffff)) >>> 0;
	};
	this.COP2LCL = function (v) {
		this.cop2lc = ((this.cop2lc & 0xffff0000) | (v & 0xfffe)) >>> 0;
	};

	this.COPJMP = function (num, vblank) {
		var oldstrobe = cop_state.strobe;

		//if (AMIGA.dmaen(DMAF_COPEN) && (cop_state.saved_i1 != 0xffff || cop_state.saved_i2 != 0xfffe))
		//BUG.info('COPJMP(%d) vblank without copper ending %08x (%08x %08x) (%08x %08x)', num, cop_state.ip, this.cop1lc, this.cop2lc, cop_state.saved_i1, cop_state.saved_i2);

		clr_special(SPCFLAG_COPPER);
		cop_state.ignore_next = 0;
		if (!oldstrobe)
			cop_state.state_prev = cop_state.state;

		if ((cop_state.state == COP_wait || cop_state.state == COP_waitforever) && !vblank)
			cop_state.state = COP_strobe_delay1x;
		else
			cop_state.state = vblank ? COP_start_delay : (this.access ? COP_strobe_delay1 : COP_strobe_extra);

		//BUG.info('COPJMP(%d) %d', num, cop_state.state);

		cop_state.vpos = AMIGA.playfield.vpos;
		cop_state.hpos = AMIGA.playfield.hpos() & ~1;
		cop_state.strobe = num;
		this.enabled_thisline = false;

		if (0) {
			this.immediate_copper(num);
			return;
		}

		if (AMIGA.dmaen(DMAF_COPEN))
			this.compute_spcflag_copper(AMIGA.playfield.hpos());
		else if (oldstrobe > 0 && oldstrobe != num && cop_state.state_prev == COP_wait) {
			/* dma disabled, copper idle and accessed both COPxJMPs -> copper stops! */
			cop_state.state = COP_stop;
			//BUG.info('COPJMP(%d) COP_stop');
		}
	};

	/*function get_copper_address(copno) {
		switch (copno) {
			case 1: return this.cop1lc;
			case 2: return this.cop2lc;
			case -1: return cop_state.ip;
			default: return 0;
		}
	}*/

	this.test_copper_dangerous = function (address) {
		var addr = address & 0x1fe;
		if (addr < ((this.copcon & 2) ? ((AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) ? 0 : 0x40) : 0x80)) {
			cop_state.state = COP_stop;
			this.enabled_thisline = false;
			clr_special(SPCFLAG_COPPER);
			return true;
		}
		return false;
	};

	this.immediate_copper = function (num) {
		var pos = 0;
		var oldpos = 0;

		cop_state.state = COP_stop;
		cop_state.vpos = AMIGA.playfield.vpos;
		cop_state.hpos = AMIGA.playfield.hpos() & ~1;
		cop_state.ip = num == 1 ? this.cop1lc : this.cop2lc;

		while (pos < (AMIGA.playfield.maxvpos << 5)) {
			if (oldpos > pos)
				pos = oldpos;
			if (!AMIGA.dmaen(DMAF_COPEN))
				break;
			if (cop_state.ip >= AMIGA.mem.chip.size)
				break;
			pos++;
			oldpos = pos;
			//cop_state.i1 = AMIGA.mem.load16_chip(cop_state.ip);
			//cop_state.i2 = AMIGA.mem.load16_chip(cop_state.ip + 2);
			cop_state.i1 = AMIGA.mem.chip.data[cop_state.ip >>> 1];
			cop_state.i2 = AMIGA.mem.chip.data[(cop_state.ip + 2) >>> 1];
			AMIGA.custom.last_value = cop_state.i2;
			cop_state.ip += 4;
			if (!(cop_state.i1 & 1)) { // move
				cop_state.i1 &= 0x1fe;
				if (cop_state.i1 == 0x88) {
					cop_state.ip = this.cop1lc;
					continue;
				}
				if (cop_state.i1 == 0x8a) {
					cop_state.ip = this.cop2lc;
					continue;
				}
				if (this.test_copper_dangerous(cop_state.i1))
					break;
				AMIGA.custom.store16_real(0, cop_state.i1, cop_state.i2, 0);
			} else { // wait or skip
				if ((cop_state.i1 >> 8) > ((pos >> 5) & 0xff))
					pos = (((pos >> 5) & 0x100) | ((cop_state.i1 >> 8)) << 5) | ((cop_state.i1 & 0xff) >> 3);
				if (cop_state.i1 >= 0xffdf && cop_state.i2 == 0xfffe)
					break;
			}
		}
		cop_state.state = COP_stop;
		clr_special(SPCFLAG_COPPER);
	};

	this.copper_cant_read = function (hpos, alloc) {
		//BUG.info('copper_cant_read2() hpos %d / %d', hpos, AMIGA.playfield.maxhpos);
		if (hpos + 1 >= AMIGA.playfield.maxhpos) // first refresh slot
			return 1;
		if ((hpos == AMIGA.playfield.maxhpos - 3) && (AMIGA.playfield.maxhpos & 1) && alloc >= 0) {
			return -1;
		}
		return AMIGA.playfield.is_bitplane_dma(hpos);
	};

	this.custom_store16_copper = function (hpos, addr, value, noget) {
		//if (addr == 0x88 || addr == 0x8a)
		//BUG.info('custom_store16_copper() addr %08x, value %04x | vpos %d hpos %d %d cvcmp %d chcmp %d chpos %d cvpos %d', addr, value, AMIGA.playfield.vpos, AMIGA.playfield.hpos(), hpos, cop_state.vcmp, cop_state.hcmp, cop_state.hpos, cop_state.vpos);
		//value = debug_wputpeekdma (0xdff000 + addr, value);
		this.access = true;
		var v = AMIGA.custom.store16_real(hpos, addr, value, noget);
		this.access = false;
		return v;
	};

	this.dump_copper = function (error, until_hpos) {
		BUG.info('\n');
		BUG.info('%s: vpos=%d until_hpos=%d vp=%d', error, AMIGA.playfield.vpos, until_hpos, AMIGA.playfield.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80));
		BUG.info('cvcmp=%d chcmp=%d chpos=%d cvpos=%d ci1=%04X ci2=%04X', cop_state.vcmp, cop_state.hcmp, cop_state.hpos, cop_state.vpos, cop_state.saved_i1, cop_state.saved_i2);
		BUG.info('cstate=%d ip=%x SPCFLAGS=%x iscline=%d', cop_state.state, cop_state.ip, AMIGA.spcflags, this.enabled_thisline ? 1 : 0);
		BUG.info('\n');
	};

	this.update = function (until_hpos) {
		var vp = AMIGA.playfield.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);
		var c_hpos = cop_state.hpos;

		//BUG.info('update() until_hpos %d, vp %d', until_hpos, vp);

		if (cop_state.state == COP_wait && vp < cop_state.vcmp) {
			this.dump_copper('error2', until_hpos);
			this.enabled_thisline = false;
			cop_state.state = COP_stop;
			clr_special(SPCFLAG_COPPER);
			return;
		}

		if (until_hpos <= this.last_copper_hpos)
			return;

		if (until_hpos > (AMIGA.playfield.maxhpos & ~1))
			until_hpos = AMIGA.playfield.maxhpos & ~1;

		for (; ;) {
			var old_hpos = c_hpos;
			var hp;

			if (c_hpos >= until_hpos)
				break;

			/* So we know about the fetch state.  */
			AMIGA.playfield.decide_line(c_hpos);
			AMIGA.playfield.decide_fetch(c_hpos);

			if (cop_state.movedelay > 0) {
				cop_state.movedelay--;
				if (cop_state.movedelay == 0) {
					this.custom_store16_copper(c_hpos, cop_state.moveaddr, cop_state.movedata, 0);
				}
			}

			if ((c_hpos == AMIGA.playfield.maxhpos - 3) && (AMIGA.playfield.maxhpos & 1))
				c_hpos += 1;
			else
				c_hpos += 2;

			switch (cop_state.state) {
				case COP_wait_in2:
				{
					if (this.copper_cant_read(old_hpos, 0))
						continue;
					cop_state.state = COP_wait1;
					break;
				}
				case COP_skip_in2:
				{
					if (this.copper_cant_read(old_hpos, 0))
						continue;
					cop_state.state = COP_skip1;
					break;
				}
				case COP_strobe_extra:
				{
					// Wait 1 copper cycle doing nothing
					cop_state.state = COP_strobe_delay1;
					break;
				}
				case COP_strobe_delay1:
				{
					// First cycle after COPJMP is just like normal first read cycle
					// Cycle is used and needs to be free.
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.state = COP_strobe_delay2;
					cop_state.ip += 2;
					break;
				}
				case COP_strobe_delay2:
				{
					// Second cycle after COPJMP. This is the strange one.
					// This cycle does not need to be free
					// But it still gets allocated by copper if it is free = CPU and blitter can't use it.
					cop_state.state = COP_read1;
					// Next cycle finally reads from new pointer
					if (cop_state.strobe == 1)
						cop_state.ip = this.cop1lc;
					else
						cop_state.ip = this.cop2lc;
					cop_state.strobe = 0;
					break;
				}
				case COP_strobe_delay1x:
				{
					// First cycle after COPJMP and Copper was waiting. This is the buggy one.
					// Cycle can be free and copper won't allocate it.
					// If Blitter uses this cycle = Copper's address gets copied blitter DMA pointer..
					cop_state.state = COP_strobe_delay2x;
					break;
				}
				case COP_strobe_delay2x:
				{
					// Second cycle fetches following word and tosses it away. Must be free cycle
					// but is not allocated, blitter or cpu can still use it.
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.state = COP_read1;
					// Next cycle finally reads from new pointer
					if (cop_state.strobe == 1)
						cop_state.ip = this.cop1lc;
					else
						cop_state.ip = this.cop2lc;
					cop_state.strobe = 0;
					break;
				}
				case COP_start_delay:
				{
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					cop_state.state = COP_read1;
					cop_state.ip = this.cop1lc;
					break;
				}
				case COP_read1:
				{
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					/* workaround for a bug in kick 1.x */
					if (cop_state.ip == 0x00000004 || cop_state.ip == 0x00000676 || cop_state.ip == 0x00c00276) {
						//BUG.info('COP_read1() invalid addr $%08x', cop_state.ip);
						cop_state.state = COP_stop;
						this.enabled_thisline = false;
						clr_special(SPCFLAG_COPPER);
						return;
					}
					//cop_state.i1 = AMIGA.mem.load16_chip(cop_state.ip);
					cop_state.i1 = AMIGA.custom.last_value = AMIGA.mem.chip.data[cop_state.ip >>> 1];
					cop_state.ip += 2;
					cop_state.state = COP_read2;
					break;
				}
				case COP_read2:
				{
					if (this.copper_cant_read(old_hpos, 1))
						continue;
					//cop_state.i2 = AMIGA.mem.load16_chip(cop_state.ip);
					cop_state.i2 = AMIGA.custom.last_value = AMIGA.mem.chip.data[cop_state.ip >>> 1];
					cop_state.ip += 2;
					cop_state.saved_i1 = cop_state.i1;
					cop_state.saved_i2 = cop_state.i2;
					cop_state.saved_ip = cop_state.ip;

					if (cop_state.i1 & 1) { // WAIT or SKIP
						cop_state.ignore_next = 0;
						if (cop_state.i2 & 1)
							cop_state.state = COP_skip_in2;
						else
							cop_state.state = COP_wait_in2;
					} else { // MOVE
						//uaecptr debugip = cop_state.ip;
						var reg = cop_state.i1 & 0x1fe;
						var data = cop_state.i2;
						cop_state.state = COP_read1;
						this.test_copper_dangerous(reg);
						if (!this.enabled_thisline) {
							//goto out; // was 'dangerous' register -> copper stopped
							cop_state.hpos = c_hpos;
							this.last_copper_hpos = until_hpos;
							return;
						}
						if (cop_state.ignore_next)
							reg = 0x1fe;

						cop_state.last_write = reg;
						cop_state.last_write_hpos = old_hpos;
						if (reg == 0x88) {
							cop_state.strobe = 1;
							cop_state.state = COP_strobe_delay1;
						} else if (reg == 0x8a) {
							cop_state.strobe = 2;
							cop_state.state = COP_strobe_delay1;
						} else {
							/*if (0) {
							 AMIGA.events.newevent2(1, (reg << 16) | data, function(v) { //copper_write);
							 AMIGA.copper.custom_store16_copper(AMIGA.playfield.hpos(), v >>> 16, v & 0xffff, 0);
							 });
							 //this.custom_store16_copper(old_hpos, reg, data, 0);
							 } else*/
							{
								// FIX: all copper writes happen 1 cycle later than CPU writes
								if (customdelay[reg >> 1]) {
									cop_state.moveaddr = reg;
									cop_state.movedata = data;
									cop_state.movedelay = customdelay[cop_state.moveaddr >> 1];
								} else {
									var hpos2 = old_hpos;
									this.custom_store16_copper(hpos2, reg, data, 0);
									hpos2++;
									if (reg >= 0x140 && reg < 0x180 && hpos2 >= SPR0_HPOS && hpos2 < SPR0_HPOS + 4 * MAX_SPRITES)
										AMIGA.playfield.do_sprites(hpos2);
								}
							}
						}
						cop_state.ignore_next = 0;
					}
					break;
				}
				case COP_wait1:
				{
					/*#if 0
					 if (c_hpos >= (AMIGA.playfield.maxhpos & ~1) || (c_hpos & 1)) break;
					 #endif*/
					cop_state.state = COP_wait;

					cop_state.vcmp = (cop_state.saved_i1 & (cop_state.saved_i2 | 0x8000)) >> 8;
					cop_state.hcmp = (cop_state.saved_i1 & cop_state.saved_i2 & 0xfe);

					vp = AMIGA.playfield.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);

					if (cop_state.saved_i1 == 0xffff && cop_state.saved_i2 == 0xfffe) {
						cop_state.state = COP_waitforever;
						this.enabled_thisline = false;
						clr_special(SPCFLAG_COPPER);
						//goto out;
						cop_state.hpos = c_hpos;
						this.last_copper_hpos = until_hpos;
						return;
					}
					if (vp < cop_state.vcmp) {
						this.enabled_thisline = false;
						clr_special(SPCFLAG_COPPER);
						//goto out;
						cop_state.hpos = c_hpos;
						this.last_copper_hpos = until_hpos;
						return;
					}
				}
				/* fall through */
				case COP_wait:
				{
					var ch_comp = c_hpos;
					if (ch_comp & 1)
						ch_comp = 0;

					if (this.copper_cant_read(old_hpos, 0))
						continue;

					hp = ch_comp & (cop_state.saved_i2 & 0xfe);
					if (vp == cop_state.vcmp && hp < cop_state.hcmp)
						break;

					/* Now we know that the comparisons were successful.  We might still have to wait for the blitter though.  */
					if ((cop_state.saved_i2 & 0x8000) == 0) {
						if (AMIGA.blitter.getState() != BLT_done) {
							//We need to wait for the blitter.
							cop_state.state = COP_bltwait;
							this.enabled_thisline = false;
							clr_special(SPCFLAG_COPPER);
							//goto out;
							cop_state.hpos = c_hpos;
							this.last_copper_hpos = until_hpos;
							return;
						}
					}
					cop_state.state = COP_read1;
					break;
				}
				case COP_skip1:
				{
					var vcmp, hcmp, vp1, hp1;

					if (c_hpos >= (AMIGA.playfield.maxhpos & ~1) || (c_hpos & 1))
						break;

					if (this.copper_cant_read(old_hpos, 0))
						continue;

					vcmp = (cop_state.saved_i1 & (cop_state.saved_i2 | 0x8000)) >> 8;
					hcmp = (cop_state.saved_i1 & cop_state.saved_i2 & 0xfe);
					vp1 = AMIGA.playfield.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);
					hp1 = c_hpos & (cop_state.saved_i2 & 0xfe);

					if ((vp1 > vcmp || (vp1 == vcmp && hp1 >= hcmp)) && ((cop_state.saved_i2 & 0x8000) != 0 || AMIGA.blitter.getState() == BLT_done))
						cop_state.ignore_next = 1;

					cop_state.state = COP_read1;
					break;
				}
			}
		}

		//out:
		cop_state.hpos = c_hpos;
		this.last_copper_hpos = until_hpos;
	};

	this.compute_spcflag_copper = function (hpos) {
		//BUG.info('compute_spcflag_copper() hpos %d', hpos);
		var wasenabled = this.enabled_thisline;

		this.enabled_thisline = false;
		clr_special(SPCFLAG_COPPER);
		if (!AMIGA.dmaen(DMAF_COPEN) || cop_state.state == COP_stop || cop_state.state == COP_waitforever || cop_state.state == COP_bltwait)
			return;

		if (cop_state.state == COP_wait) {
			var vp = AMIGA.playfield.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);

			if (vp < cop_state.vcmp)
				return;
		}
		// do not use past cycles if starting for the first time in this line
		// (write to DMACON for example) hpos+1 for long lines
		if (!wasenabled && cop_state.hpos < hpos && hpos < AMIGA.playfield.maxhpos) {
			hpos = (hpos + 2) & ~1;
			if (hpos > AMIGA.playfield.maxhpos_short)
				hpos = AMIGA.playfield.maxhpos_short;
			cop_state.hpos = hpos;
			//BUG.info('compute_spcflag_copper() hpos %d %d', hpos, AMIGA.playfield.maxhpos_short);
		}

		// if COPJMPx was written while DMA was disabled, advance to next state,
		// COP_strobe_extra is single cycle only and does not need free bus.
		// (copper state emulation does not run if DMA is disabled)
		if (!wasenabled && cop_state.state == COP_strobe_extra)
			cop_state.state = COP_strobe_delay1;

		this.enabled_thisline = true;
		set_special(SPCFLAG_COPPER);
	};

	this.blitter_done_notify = function (hpos) {
		if (cop_state.state != COP_bltwait)
			return;

		//BUG.info('blitter_done_notify() hpos %d', hpos);

		var vp = AMIGA.playfield.vpos;
		hpos += 3;
		hpos &= ~1;
		if (hpos >= AMIGA.playfield.maxhpos) {
			hpos -= AMIGA.playfield.maxhpos;
			vp++;
		}
		cop_state.hpos = hpos;
		cop_state.vpos = vp;
		cop_state.state = COP_read1;

		if (AMIGA.dmaen(DMAF_COPEN) && vp == AMIGA.playfield.vpos) {
			this.enabled_thisline = true;
			set_special(SPCFLAG_COPPER);
		}
	};

	this.cycle = function () {
		this.update(AMIGA.playfield.hpos());
	};

	this.sync_copper_with_cpu = function (hpos, do_schedule) {
		/* Need to let the copper advance to the current position.  */
		if (this.enabled_thisline)
			this.update(hpos);
	};

	/*this.check = function (n) {
		if (cop_state.state == COP_wait) {
			var vp = AMIGA.playfield.vpos & (((cop_state.saved_i2 >> 8) & 0x7f) | 0x80);
			if (vp < cop_state.vcmp) {
				if (this.enabled_thisline)
					BUG.info('COPPER BUG %d: vp=%d vpos=%d vcmp=%d thisline=%d', n, vp, AMIGA.playfield.vpos, cop_state.vcmp, this.enabled_thisline?1:0);
			}
		}
	}*/
}		

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
*
* TODO:
* - Faster versions of ASx/LSx/ROx/ROXx and xBCD
*
*  Notes:
* - Based on M68000PRM.pdf
* - Written from scratch.
* 
**************************************************************************/

function CPU() {
	const M_rdd		=  1; /* Register Direct Data */
	const M_rda		=  2; /* Register Direct Address */
	const M_ria		=  3; /* Register Indirect Address */
	const M_ripo	=  4; /* Register Indirect	Address with Postincrement */
	const M_ripr	=  5; /* Register Indirect	Address with Predecrement */
	const M_rid		=  6; /* Register Indirect	Address with Displacement */
	const M_rii		=  7; /* Address Register Indirect, with Index (8-Bit Displacement) */
	const M_pcid	=  8; /* Program Counter Indirect with Displacement */
	const M_pcii	=  9; /* Program Counter Indirect with Index	(8-Bit Displacement) */
	const M_absw	= 10; /* Absolute Data Addressing */
	const M_absl	= 11; /* Absolute Data Addressing */
	const M_imm		= 12; /* Immediate Data */
	const M_list	= 16; /* Ax,Dx-list for easy MOVEM debug */

	const T_RD = 1; /* Register Data */
	const T_RA = 2; /* Register Address */
	const T_AD = 3; /* Address */
	const T_IM = 4; /* Immediate */

	const ccNames = ['T', 'F', 'HI', 'LS', 'CC', 'CS', 'NE', 'EQ', 'VC', 'VS', 'PL', 'MI', 'GE', 'LT', 'GT', 'LE'];

	/* Effective Address */
	function EffAddr(m, r) {
		this.m = m; /* Mode M_ */
		this.t = 0; /* Type T_ */
		this.r = r; /* Register An/Dn */
		this.a = 0; /* Address */
		this.c = 0; /* Cycles */
	}

	/* Instruction Condition */
	function ICon(cc, dp, dr) {
		this.cc = cc; /* Condition Code */
		this.dp = dp; /* Displacement */
		this.dr = dr; /* Data Register for DBcc */
	}

	/* Instruction Paramenter */
	function IPar() {
		this.z = 0; /* size B,W,L */
		/* Filled on demand 
		this.s = new EffAddr();
		this.d = new EffAddr();
		this.c = new ICon();
		this.ms = 0;
		this.mz = 0;
		this.cyc = 0;*/
	}

	/* Instruction Definition */
	function IDef() {
		this.op = 0; /* OP-code */
		//this.pr = false; /* Privileged */
		this.mn = ''; /* Mnemonic */
		this.f = null; /* Function */
		this.p = new IPar();
	}

	/* Exception 2/3 error */
	function Exception23(num) {
		this.num = num;
	}
	Exception23.prototype = new Error;

	/*-----------------------------------------------------------------------*/

	const undef = false; /* use undef */

	var regs = {
		//d: [0, 0, 0, 0, 0, 0, 0, 0], /* Dn */
		//a: [0, 0, 0, 0, 0, 0, 0, 0], /* An */
		d: new Uint32Array(8),
		a: new Uint32Array(8),
		/* Status Register (SR) */
		t: false,
		s: false,
		intmask: 0,
		/* Condition Code Register (CCR) */
		x: false,
		n: false,
		z: false,
		v: false,
		c: false,
		usp: 0, /* User Stack Ptr (USP) */
		isp: 0, /* Interrupt Stack Ptr (ISP) */
		pc: 0, /* Program Counter (PC) */
		stopped:true
	};
	var fault = {
		op: 0,
		pc: 0,
		ad: 0,
		ia: false
	};
	var iTab = null;
	var cpu_cycle_unit = CYCLE_UNIT / 2;
	var cpu_cycles = 4 * cpu_cycle_unit;
	
	/*-----------------------------------------------------------------------*/

	this.setup = function () {
		if (iTab === null) {
			BUG.say('cpu.setup() no instruction table, generating...');
			if (!mkiTab())
				Fatal(SAEE_CPU_Internal, 'cpu.setup() error generating function table');
		} else
			BUG.say('cpu.setup() instruction table is cached');
	};

	this.reset = function (addr) {
		for (var i = 0; i < 8; i++)
			regs.d[i] = regs.a[i] = 0;

		regs.t = false;
		regs.s = true;
		regs.intmask = 7;
		regs.x = regs.n = regs.z = regs.v = regs.c = false;
		regs.usp = 0;
		regs.isp = 0;
		regs.a[7] = AMIGA.mem.load32(addr);
		regs.pc = AMIGA.mem.load32(addr + 4);
		regs.stopped = false;

		BUG.say(sprintf('cpu.reset() addr 0x%08x, A7 0x%08x, PC 0x%08x', addr, regs.a[7], regs.pc));
	};

	/*-----------------------------------------------------------------------*/

	function szChr(z) {
		switch (z) {
			case 0: return 'S';
			case 1: return 'B';
			case 2: return 'W';
			case 4: return 'L';
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.szChr() invalid size');
				return '';
		}
	}
	
	function regsStr(v, inv) {
		var out = '';
		for (var i = 0; i < 16; i++) {
			if (v & (1 << (inv ? 15-i : i))) {
				if (i < 8) {
					out += 'D'+i+' ';
				} else {
					out += 'A'+(i-8)+' ';								
				}
			}
		}
		return out;
	}	

	function castByte(v) {
		return (v & 0x80) ? (v - 0x100) : v;
	}
	function castWord(v) {
		return (v & 0x8000) ? (v - 0x10000) : v;
	}
	function castLong(v) {
		return (v & 0x80000000) ? (v - 0x100000000) : v;
	}

	function extByteToWord(v) {
		return (v & 0x80) ? (0xff00 | v) : v;
	}
	function extByte(v) {
		return (v & 0x80) ? ((0xffffff00 | v) >>> 0) : v;
	}
	function extWord(v) {
		return (v & 0x8000) ? ((0xffff0000 | v) >>> 0) : v;
	}

	function add32(a, b) {
		var r = a + b;
		return r > 0xffffffff ? r - 0x100000000 : r;
	}
	function addAuto(a, b, z) {
		var r = a + b;
		switch (z) {
			case 1: return r > 0xff ? r - 0x100 : r;
			case 2: return r > 0xffff ? r - 0x10000 : r;
			case 4: return r > 0xffffffff ? r - 0x100000000 : r;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.addAuto() invalid size');
				return 0;
		}
	}
	function sub32(a, b) {
		var r = a - b;
		return r < 0 ? r + 0x100000000 : r;
	}
	function subAuto(a, b, z) {
		var r = a - b;
		switch (z) {
			case 1: return r < 0 ? r + 0x100 : r;
			case 2: return r < 0 ? r + 0x10000 : r;
			case 4: return r < 0 ? r + 0x100000000 : r;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.subAuto() invalid size');
				return 0;
		}
	}

	function nextOPCode() {
		var op = AMIGA.mem.load16(regs.pc);
		fault.pc = regs.pc;
		fault.op = op;
		regs.pc += 2;
		return op;
	}
	function nextIWord() {
		var r = AMIGA.mem.load16(regs.pc);
		regs.pc += 2;
		return r;
	}
	function nextILong() {
		var r = AMIGA.mem.load32(regs.pc);
		regs.pc += 4;
		return r;
	}

	//var scale = 1 << ((ext & 0x600) >> 9); if (scale != 1) alert('exII() scale '+scale);
	function exII(base) {
		var ext = nextIWord();
		if (ext & 0x100) {
			Fatal(SAEE_CPU_68020_Required, 'cpu.exII() Full extension index (not a 68000 program)');
			return 0;
		} else {
			var disp = extByte(ext & 0xff);
			var r = (ext & 0x7000) >> 12;
			var reg = (ext & 0x8000) ? regs.a[r] : regs.d[r];
			if (!(ext & 0x800)) reg = extWord(reg & 0xffff);
			return add32(add32(base, disp), reg);		
		}		
	}
	
	function exEA(ea, z) {
		var dp;

		switch (ea.m) {
			case M_rdd:
				ea.a = ea.r;
				ea.t = T_RD;
				break;
			case M_rda:
				ea.a = ea.r;
				ea.t = T_RA;
				break;
			case M_ria:
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				break;
			case M_ripo:
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				regs.a[ea.r] += z;
				if (regs.a[ea.r] > 0xffffffff) {
					BUG.say(sprintf('exEA() M_ripo A%d > 2^32 ($%x)', ea.r, regs.a[ea.r]));
					regs.a[ea.r] -= 0x100000000;
					//AMIGA.cpu.diss(fault.pc, 1);
					//AMIGA.cpu.dump();  
					//exception2(regs.a[ea.r], 0);
				}
				break;
			case M_ripr:
				regs.a[ea.r] -= z;
				if (regs.a[ea.r] < 0) {
					BUG.say(sprintf('exEA() M_ripr A%d < 0 ($%x)', ea.r, regs.a[ea.r]));
					regs.a[ea.r] += 0x100000000;
					//AMIGA.cpu.diss(fault.pc, 1);
					//AMIGA.cpu.dump();  
					//exception2(regs.a[ea.r], 0);
				}
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				break;
			case M_rid:
				dp = (nextIWord());
				ea.a = add32(regs.a[ea.r], extWord(dp));
				ea.t = T_AD;
				break;
			case M_rii:
				ea.a = exII(regs.a[ea.r]);
				ea.t = T_AD;
				break;
			case M_pcid:
				dp = extWord(nextIWord());
				ea.a = add32(regs.pc - 2, dp);
				ea.t = T_AD;
				break;
			case M_pcii:
				ea.a = exII(regs.pc);
				ea.t = T_AD;
				break;
			case M_absw:
				ea.a = extWord(nextIWord());
				ea.t = T_AD;
				break;
			case M_absl:
				ea.a = nextILong();
				ea.t = T_AD;
				break;
			case M_imm: {
				if (ea.r == -1) {
					switch (z) {
						case 1: ea.a = nextIWord() & 0xff; break;
						case 2: ea.a = nextIWord(); break;
						case 4: ea.a = nextILong(); break;
						default:
							Fatal(SAEE_CPU_Internal, 'cpu.exEA() invalid size');
					}
				} else 
					ea.a = ea.r;
				ea.t = T_IM;
				break;
			}
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.exEA() invalid mode (' + ea.m + ')');
		}
		return ea;
	}

	function exEAM(ea) { /* MOVEM */
		var dp;

		switch (ea.m) {
			case M_ria:
			case M_ripo:
			case M_ripr:
				ea.a = regs.a[ea.r];
				ea.t = T_AD;
				break;
			case M_rid:
				dp = extWord(nextIWord());
				ea.a = add32(regs.a[ea.r], dp);
				ea.t = T_AD;
				break;
			case M_rii:
				ea.a = exII(regs.a[ea.r]);
				ea.t = T_AD;
				break;
			case M_pcid:
				dp = extWord(nextIWord());
				ea.a = add32(regs.pc - 2, dp);
				ea.t = T_AD;
				break;
			case M_pcii:
				ea.a = exII(regs.pc);
				ea.t = T_AD;
				break;
			case M_absw:
				ea.a = extWord(nextIWord());
				ea.t = T_AD;
				break;
			case M_absl:
				ea.a = nextILong();
				ea.t = T_AD;
				break;
			case M_list: /* M_imm */
				ea.a = nextIWord();
				ea.t = T_IM;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.exEAM() invalid mode (' + ea.m + ')');
		}
		ea.c = 0;
		return ea;
	}

	function ldEA(ea, z) {
		switch (ea.t) {
			case T_RD: {
				switch (z) {
					case 1: return regs.d[ea.a] & 0xff;
					case 2: return regs.d[ea.a] & 0xffff;
					case 4: return regs.d[ea.a];
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.ldEA() T_RD invalid size');
						return 0;
				}
			}
			case T_RA: {			
				switch (z) {
					case 2: return regs.a[ea.a] & 0xffff;
					case 4: return regs.a[ea.a];
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.ldEA() T_RA invalid size');
						return 0;
				}
			}
			case T_AD: {
				/* The USP must not be byte-aligned */
				if (ea.m == M_ripo && ea.r == 7 && z == 1) {
					//BUG.say(sprintf('ldEA() USP ADDRESS ERROR A7 $%08x', regs.a[7]));
					regs.a[7]++;
					return AMIGA.mem.load16(regs.a[7] - 2) >> 8;
				}
				if (ea.a > 0xffffff) { //&& ea.m != M_absl) {
					//BUG.say(sprintf('ldEA() BUS ERROR, $%08x > 24bit, reducing address to $%08x', ea.a, ea.a & 0xffffff));
					ea.a &= 0xffffff;
				}
				if ((ea.a & 1) && z != 1) { 
					BUG.say(sprintf('ldEA() ADDRESS ERROR $%08x, pc $%08x', ea.a, fault.pc));
					//AMIGA.cpu.diss(fault.pc-8, 20);
					//AMIGA.cpu.dump();  
					exception3(ea.a, 1);
				}	
				switch (z) {
					case 1: return AMIGA.mem.load8(ea.a);
					case 2: return AMIGA.mem.load16(ea.a);
					case 4: return AMIGA.mem.load32(ea.a);
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.ldEA() T_AD invalid size');
						return 0;
				}
			}
			case T_IM:
				return ea.a;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.ldEA() invalid type (' + ea.t + ')');
				return 0;
		}
	}

	function stEA(ea, z, v) {
		switch (ea.t) {
			case T_RD:
				switch (z) {
					case 1: regs.d[ea.a] = ((regs.d[ea.a] & 0xffffff00) | v) >>> 0; break;
					case 2: regs.d[ea.a] = ((regs.d[ea.a] & 0xffff0000) | v) >>> 0; break;
					case 4: regs.d[ea.a] = v; break;
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.stEA() invalid size');
				}
				break;
			case T_RA:
				regs.a[ea.a] = v;
				break;
			case T_AD: {
				/* The USP must not be byte-aligned */
				if (ea.m == M_ripr && ea.r == 7 && z == 1) {
					//BUG.say(sprintf('stEA() USP ADDRESS ERROR A7 $%08x', regs.a[7]));
					AMIGA.mem.store16(--regs.a[7], v << 8);
					return;
				}
				if (ea.a > 0xffffff) { //&& ea.m != M_absl) {
					//BUG.say(sprintf('stEA() BUS ERROR, $%08x > 24bit, reducing address to $%08x', ea.a, ea.a & 0xffffff));
					ea.a &= 0xffffff;
				}
				if ((ea.a & 1) && z != 1) {
					BUG.say(sprintf('stEA() ADDRESS ERROR $%08x, pc $%08x', ea.a, fault.pc));
					//AMIGA.cpu.diss(fault.pc-8, 20);
					//AMIGA.cpu.dump();  
					exception3(ea.a, 1);
				}				
				switch (z) {
					case 1: AMIGA.mem.store8(ea.a, v); break;
					case 2: AMIGA.mem.store16(ea.a, v); break;
					case 4: AMIGA.mem.store32(ea.a, v); break;
					default:
						Fatal(SAEE_CPU_Internal, 'cpu.stEA() invalid size');
				}
				break;
			}
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.stEA() invalid type (' + ea.t + ')');
		}
	}

	function ccTrue(cc) {
		switch (cc) {
			case 0: return true; //T
			case 1: return false; //F
			case 2: return !regs.c && !regs.z; //HI
			case 3: return regs.c || regs.z; //LS 
			case 4: return !regs.c; //CC
			case 5: return regs.c; //CS
			case 6: return !regs.z; //NE
			case 7: return regs.z; //EQ
			case 8: return !regs.v; //VC
			case 9: return regs.v; //VV
			case 10: return !regs.n; //PL
			case 11: return regs.n; //MI
			case 12: return regs.n == regs.v; //GE
			case 13: return regs.n != regs.v; //LT
			case 14: return !regs.z && (regs.n == regs.v); //GT
			case 15: return regs.z || (regs.n != regs.v); //LE									
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.ccTrue() invalid condition code (' + cc + ')');
				return false;
		}
	}
	
	/*switch (z) {
		case 1: if (S > 0xff || D > 0xff || R > 0xff) alert('fadd 8'); break;
		case 2: if (S > 0xffff || D > 0xffff || R > 0xffff) alert('fadd 16'); break;
	}*/
	function flgAdd(S, D, R, z, isADDX) /* ADD, ADDI, ADDQ, ADDX */
	{
		var Sm, Dm, Rm;
		
		switch (z) {
			case 1:
				Sm = (S & 0x80) != 0;
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Sm = (S & 0x8000) != 0;
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Sm = (S & 0x80000000) != 0;
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgAdd() invalid size');
		}	
		regs.v = (Sm && Dm && !Rm) || (!Sm && !Dm && Rm);
		regs.c = (Sm && Dm) || (!Rm && Dm) || (Sm && !Rm);
		regs.x = regs.c;
		regs.n = Rm;
		if (isADDX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	/*switch (z) {
		case 1: if (S > 0xff || D > 0xff || R > 0xff) alert('fsub 8'); break;
		case 2: if (S > 0xffff || D > 0xffff || R > 0xffff) alert('fsub 16'); break;
	}*/
	function flgSub(S, D, R, z, isSUBX) /* SUB, SUBI, SUBQ, SUBX */
	{
		var Sm, Dm, Rm;
		
		switch (z) {
			case 1:
				Sm = (S & 0x80) != 0;
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Sm = (S & 0x8000) != 0;
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Sm = (S & 0x80000000) != 0;
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgSub() invalid size');
		}	
		regs.v = (!Sm && Dm && !Rm) || (Sm && !Dm && Rm);
		regs.c = (Sm && !Dm) || (Rm && !Dm) || (Sm && Rm);
		regs.x = regs.c;
		regs.n = Rm;
		if (isSUBX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}

	/*switch (z) {
		case 1: if (S > 0xff || D > 0xff || R > 0xff) alert('fcmp 8'); break;
		case 2: if (S > 0xffff || D > 0xffff || R > 0xffff) alert('fcmp 16'); break;
	}*/
	function flgCmp(S, D, R, z) /* CMP, CMPA, CMPI, CMPM */
	{
		var Sm, Dm, Rm;
		
		switch (z) {
			case 1:
				Sm = (S & 0x80) != 0;
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Sm = (S & 0x8000) != 0;
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Sm = (S & 0x80000000) != 0;
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgCmp() invalid size');
		}	
		regs.v = (!Sm && Dm && !Rm) || (Sm && !Dm && Rm);
		regs.c = (Sm && !Dm) || (Rm && !Dm) || (Sm && Rm);
		regs.n = Rm;
		regs.z = R == 0;
	}
	
	/*switch (z) {
		case 1: if (D > 0xff || R > 0xff) alert('fneg 8'); break;
		case 2: if (D > 0xffff || R > 0xffff) alert('fneg 16'); break;
	}*/
	function flgNeg(D, R, z, isNEGX) /* NEG, NEGX */
	{
		var Dm, Rm;
		
		switch (z) {
			case 1:
				Dm = (D & 0x80) != 0;
				Rm = (R & 0x80) != 0;
				break;
			case 2:
				Dm = (D & 0x8000) != 0;
				Rm = (R & 0x8000) != 0;
				break;
			case 4:
				Dm = (D & 0x80000000) != 0;
				Rm = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgNeg() invalid size');
		}	
		regs.v = Dm && Rm;
		regs.c = Dm || Rm;		
		regs.x = regs.c;
		regs.n = Rm;
		if (isNEGX) {
			if (R != 0)
				regs.z = false;
		} else
			regs.z = R == 0;
	}
	
	/*switch (z) {
		case 1: if (R > 0xff) alert('flog 8'); break;
		case 2: if (R > 0xffff) alert('flog 16'); break;
	}*/
	function flgLogical(R, z) { /* AND ANDI OR ORI EOR EORI MOVE MOVEQ EXT NOT TST */
		switch (z) {
			case 1:
				regs.n = (R & 0x80) != 0;
				break;
			case 2:
				regs.n = (R & 0x8000) != 0;
				break;
			case 4:
				regs.n = (R & 0x80000000) != 0;
				break;
			default:
				Fatal(SAEE_CPU_Internal, 'cpu.flgLogical() invalid size');
		}
		regs.z = R == 0;
		regs.v = regs.c = false;
	}
	
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/* Data Movement */

	function I_EXG(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		stEA(sea, p.z, d);
		stEA(dea, p.z, s);
		//ccna
		//BUG.say(sprintf('I_EXG.%s s $%08x <-> d $%08x', szChr(p.z), s, d));
		return p.cyc;//6;
	}
		  	
	function I_LEA(p) {
		var sea = exEA(p.s, p.z);
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, sea.a);
		//ccna
		//BUG.say(sprintf('I_LEA.%s sea $%08x', szChr(p.z), sea.a));
		return p.cyc;		
	}

	function I_PEA(p) {
		var sea = exEA(p.s, p.z);
		var dea = exEA(new EffAddr(M_ripr, 7), p.z);
		stEA(dea, p.z, sea.a);
		//ccna			
		return p.cyc;		
	}

	function I_LINK(p) {
		var sea = exEA(p.s, p.z);
		var An = sea.a;
		var dea = exEA(p.d, p.z);
		var dp = ldEA(dea, p.z); if (p.z == 2) dp = extWord(dp);

		stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.a[An]);
		regs.a[An] = regs.a[7];
		regs.a[7] = add32(regs.a[7], dp);
		//ccna
		return p.cyc;

		/*debug
		var newsp = add32(regs.a[7], dp);
		BUG.say(sprintf('I_LINK.%s A%d, dp $%08x, oldsp $%08x, newsp $%08x', szChr(p.z), An, dp, regs.a[7], newsp));
		regs.a[7] = newsp;*/
	}

	function I_UNLK(p) {
		var sea = exEA(p.s, p.z);
		var An = sea.a;
		regs.a[7] = regs.a[An];
		regs.a[An] = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
		//ccna
		//BUG.say(sprintf('I_UNLK.%s A%d', szChr(p.z), An));
		return p.cyc;
	}

	function I_MOVE(p) {
		var sea = exEA(p.s, p.z);			
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, s);
		flgLogical(s, p.z);
		//BUG.say(sprintf('I_MOVE.%s sm %d dm %d sa $%08x da $%08x r $%08x', szChr(p.z), p.s.m, p.d.m, sea.a, dea.a, s));				
		return p.cyc;
	}

	function I_MOVEA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		stEA(dea, 4, s);
		//ccna
		//BUG.say(sprintf('I_MOVEA.%s s $%08x A%d', szChr(p.z), s, p.d.r));		 			
		return p.cyc;
	}

	function I_MOVEQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); s = extByte(s);
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, s);
		flgLogical(s, p.z);
		//BUG.say(sprintf('I_MOVEQ.%s s $%08x', szChr(p.z), s));
		return p.cyc;
	}
					  
	function I_MOVEM_R2M(p) {
		/* p. 4-128: The MC68000 and MC68010 write the initial register value (not decremented). */
		var i, rd = [], ra = []; 
		for (i = 0; i < 8; i++) {
			rd[i] = regs.d[i];
			ra[i] = regs.a[i];
		}
		var sea = exEAM(p.s);
		var dea = exEAM(p.d);
		var n = 0, k;

		if (p.d.m == M_ripr) {
			var c = 0;
			for (var i = 0; i < 16; i++) {
				if (sea.a & (1 << i)) c++;
			}
			c *= p.z;
			regs.a[p.d.r] -= c;
			dea.a -= c;
			k = 15;
			//BUG.say(sprintf('I_MOVEM_R2M.%s M_ripr bc %d == %d bytes', szChr(p.z), bc, bc * p.z));				
		} else k = 0;

		for (var i = 0; i < 16; i++) {
			if (sea.a & (1 << (i ^ k))) {
				var r;

				if (i < 8) {
					r = rd[i];
					//BUG.say(sprintf('I_MOVEM_R2M.%s D%d d $%08x', szChr(p.z), i, r));				
				} else {
					r = ra[i - 8];
					//BUG.say(sprintf('I_MOVEM_R2M.%s A%d d $%08x', szChr(p.z), i - 8, r));									
					//if (i - 8 == p.d.r) BUG.say(sprintf('I_MOVEM_R2M.%s A%d d $%08x, WRITE OWN', szChr(p.z), i - 8, r));									
				}
				if (p.z == 2)
					r &= 0xffff;
					
				stEA(dea, p.z, r);
				dea.a += p.z;
				n++;
			}
		}
		//ccna	
		//BUG.say(sprintf('I_MOVEM_R2M.%s s $%08x d $%08x', szChr(p.z), sea.a, dea.a));
		return [p.cyc[0] + (p.z == 2 ? 4 : 8) * n, 0,0]; //FIXME	
	}
					  
	function I_MOVEM_M2R(p) {
		var sea = exEAM(p.s);
		var dea = exEAM(p.d);
		var n = 0;

		for (var i = 0; i < 16; i++) {
			if (sea.a & (1 << i)) {
				var r = ldEA(dea, p.z); if (p.z == 2) r = extWord(r);
				dea.a += p.z;

				if (i < 8) {
					regs.d[i] = r;
					//BUG.say(sprintf('I_MOVEM_M2R.%s D%d d $%08x', szChr(p.z), i, regs.d[i]));				
				} else {
					regs.a[i - 8] = r;
					//BUG.say(sprintf('I_MOVEM_M2R.%s A%d d $%08x', szChr(p.z), i - 8, regs.a[i - 8]));									
				}
				n++;
			}
		}
		if (p.d.m == M_ripo) {
			//BUG.say(sprintf('I_MOVEM_M2R.%s RIPO old $%08x', szChr(p.z), regs.a[p.d.r]));		
			regs.a[p.d.r] = dea.a;
			//BUG.say(sprintf('I_MOVEM_M2R.%s RIPO new $%08x', szChr(p.z), regs.a[p.d.r]));		
		}
		//ccna		
		//BUG.say(sprintf('I_MOVEM_M2R.%s s $%08x d $%08x', szChr(p.z), sea.a, dea.a));		
		return [p.cyc[0] + (p.z == 2 ? 4 : 8) * n, 0,0]; //FIXME	
	}

	function I_MOVEP(p) {
		var sea = exEA(p.s, p.z);
		var dea = exEA(p.d, p.z);

		//M2R
		if (sea.m == M_rid) {
			var r;

			if (p.z == 2) {
				r = ldEA(sea, 1) << 8;
				sea.a += 2;
				r += ldEA(sea, 1);
			} else {
				r = ldEA(sea, 1) << 24;
				sea.a += 2;
				r += ldEA(sea, 1) << 16;
				sea.a += 2;
				r += ldEA(sea, 1) << 8;
				sea.a += 2;
				r += ldEA(sea, 1);
				r >>>= 0;
			}
			//BUG.say(sprintf('I_MOVEP_M2R.%s A%d addr $%08x r $%08x', szChr(p.z), dea.a, sea.a - (p.z == 2 ? 4 : 8), r));
			stEA(dea, p.z, r);
		}
		//R2M
		else {
			var r = ldEA(sea, p.z);

			if (p.z == 2) {
				stEA(dea, 1, r >> 8);
				dea.a += 2;
				stEA(dea, 1, r);
			} else {
				stEA(dea, 1, r >> 24);
				dea.a += 2;
				stEA(dea, 1, r >> 16);
				dea.a += 2;
				stEA(dea, 1, r >> 8);
				dea.a += 2;
				stEA(dea, 1, r);
			}
			//BUG.say(sprintf('I_MOVEP_R2M.%s A%d addr $%08x r $%08x', szChr(p.z), sea.a, dea.a - (p.z == 2 ? 4 : 8), r));
		}
		//ccna		
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Integer Arithmetic */
	
	function I_ADD(p) {
		var sea = exEA(p.s, p.z); 
		var s = ldEA(sea, p.z); 
		var dea = exEA(p.d, p.z); 
		var d = ldEA(dea, p.z);
		var r = addAuto(s, d, p.z);
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, false);
		//BUG.say(sprintf('I_ADD.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));	
		return p.cyc;	  
	}

	function I_ADDA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = add32(s, d);
		stEA(dea, 4, r);
		//ccna
		//BUG.say(sprintf('I_ADDA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));	
		return p.cyc;	  
	}

	function I_ADDI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = addAuto(s, d, p.z);
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, false);
		//BUG.say(sprintf('I_ADDI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));	
		return p.cyc;  
	}

	/*function I_ADDQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		if (p.d.m == M_rda) {
			var dea = exEA(p.d, 4);
			var d = ldEA(dea, 4); 
			var r = add32(s, d);
			stEA(dea, 4, r);
			//ccna
			//return 8;  			
		} else {
			var dea = exEA(p.d, p.z);
			var d = ldEA(dea, p.z);
			var r = addAuto(s, d, p.z);
			stEA(dea, p.z, r);
			flgAdd(s, d, r, p.z, false);
			//return dea.m == M_rdd ? (p.z == 4 ? 8 : 4) : (p.z == 4 ? 12 : 8) + dea.c;  
		}
		//BUG.say(sprintf('I_ADDQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}*/

	function I_ADDQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = addAuto(s, d, p.z);
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, false); 
		//BUG.say(sprintf('I_ADDQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}
	function I_ADDQA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4); 
		var r = add32(s, d);
		stEA(dea, 4, r);
		//ccna	
		//BUG.say(sprintf('I_ADDQA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	function I_ADDX(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); 
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z); 
		var r = addAuto(s, d, p.z); if (regs.x) r = addAuto(r, 1, p.z);
		//var _x = regs.x?1:0;		
		stEA(dea, p.z, r);
		flgAdd(s, d, r, p.z, true);
		//BUG.say(sprintf('I_ADDX.%s s $%08x d $%08x xo %d xn %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));
		return p.cyc;
	}

	function I_CLR(p) {
		var dea = exEA(p.d, p.z);
		//var foo = ldEA(dea, p.z); /* In the MC68000 and MC68008 a memory location is read before it is cleared. */
		stEA(dea, p.z, 0);

		regs.n = false;
		regs.z = true;
		regs.v = false;
		regs.c = false;
		//BUG.say(sprintf('I_CLR.%s', szChr(p.z)));
		return p.cyc;
	}

	function I_CMP(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		flgCmp(s, d, r, p.z);
		//BUG.say(sprintf('I_CMP.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;	  
	}

	function I_CMPA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = sub32(d, s);
		flgCmp(s, d, r, 4);
		//BUG.say(sprintf('I_CMPA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;	  
	}

	function I_CMPI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		flgCmp(s, d, r, p.z);
		//BUG.say(sprintf('I_CMPI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;
	}

	function I_CMPM(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		flgCmp(s, d, r, p.z);
		//BUG.say(sprintf('I_CMPM.%s s $%08x d $%08x r $%08x | %c', szChr(p.z), s, d, r, s));
		return p.cyc;
	}

	function I_DIVS(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); s = castWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4); d = castLong(d);

		regs.c = false;
		if (s == 0) {
			BUG.say(sprintf('I_DIVS NULL $%08x / $%08x', d, s));			
			regs.pc = fault.pc;
			return exception(5);
		} else {
			var quo = ~~(d / s); /* Thanks 'dmcoles' */

			if (quo < 0) quo += 0x10000;

			if (quo < 0 || quo > 0xffff) {
				regs.v = true;
				//BUG.say(sprintf('I_DIVS.%s $%08x / $%08x = OVERFLOW (quo $%08x | rem $%08x)', szChr(p.z), d, s, quo, rem));			
			} else {
				var rem = d % s;

				if (rem && ((rem < 0) != (d < 0))) rem = -rem;
				if (rem < 0) rem += 0x10000;

				regs.v = false;
				regs.z = quo == 0;
				regs.n = (quo & 0x8000) != 0;

				var r = ((rem << 16) | quo) >>> 0;
				stEA(dea, 4, r);
				//BUG.say(sprintf('I_DIVS.%s $%08x / $%08x = $%08x (quo $%08x | rem $%08x)', szChr(p.z), d, s, r, quo, rem));			
			}
			return p.cyc;
		}
	}

	function I_DIVU(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);

		regs.c = false;
		if (s == 0) {
			BUG.say(sprintf('I_DIVU NULL $%08x / $%08x', d, s));			
			regs.pc = fault.pc;
			return exception(5);
		} else {
			var quo = Math.floor(d / s);

			if (quo > 0xffff) {
				regs.v = true;
				//BUG.say(sprintf('I_DIVU.%s $%08x / $%08x = OVERFLOW (quo $%08x | rem $%08x)', szChr(p.z), d, s, quo, rem));			
			} else {
				var rem = d % s;

				if (rem && (!!(rem & 0x8000) != !!(d & 0x80000000))) {
					//var oldrem = rem;
					rem = -rem + 0x10000;	
					//BUG.say(sprintf('I_DIVU d $%08x oldrem $%08x rem $%08x', d, oldrem, rem)); 
				}
				regs.v = false;
				regs.z = quo == 0;
				regs.n = (quo & 0x8000) != 0;

				var r = ((rem << 16) | quo) >>> 0;
				stEA(dea, 4, r);
				//BUG.say(sprintf('I_DIVU.%s $%08x / $%08x = $%08x (quo $%08x | rem $%08x)', szChr(p.z), d, s, r, quo, rem));			
			}
			return p.cyc;
		}
	}

	function I_EXT(p) {
		var z = p.z == 2 ? 1 : 2;
		var dea = exEA(p.d, z);
		var d = ldEA(dea, z);
		var r = p.z == 2 ? extByteToWord(d) : extWord(d);
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_EXT.%s d $%08x r $%08x', szChr(p.z), d, r));
		return p.cyc;
	}

	function I_MULS(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); s = castWord(s);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z); d = castWord(d);
		var r = s * d;
		if (r < 0) r += 0x100000000;
		stEA(dea, 4, r);

		regs.v = false; /* not possible for 16x16 */
		regs.c = false;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_MULS.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;
	}

	function I_MULU(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = s * d;
		stEA(dea, 4, r);

		regs.v = false; /* not possible for 16x16 */
		regs.c = false;
		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_MULU.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));
		return p.cyc;
	}

	function I_NEG(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(0, d, p.z);
		stEA(dea, p.z, r);
		flgNeg(d, r, p.z, false);
		//BUG.say(sprintf('I_NEG.%s d $%08x r $%08x', szChr(p.z), d, r));
		return p.cyc;
	}
	
	function I_NEGX(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(0, d, p.z); if (regs.x) r = subAuto(r, 1, p.z);
		stEA(dea, p.z, r);
		flgNeg(d, r, p.z, true);
		//BUG.say(sprintf('I_NEGX.%s d $%08x x %d r $%08x', szChr(p.z), d, regs.x ? 1 : 0, r));
		return p.cyc;  
	}

	function I_SUB(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		stEA(dea, p.z, r);
		flgSub(s, d, r, p.z, false);
		//BUG.say(sprintf('I_SUB.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));				
		return p.cyc;	  
	}

	function I_SUBA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z); if (p.z == 2) s = extWord(s);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = sub32(d, s);
		stEA(dea, 4, r);
		//ccna		
		//BUG.say(sprintf('I_SUBA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;	  
	}

	function I_SUBI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		stEA(dea, p.z, r);
		flgSub(s, d, r, p.z, false);
		//BUG.say(sprintf('I_SUBI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));				
		return p.cyc;
	}

	/*function I_SUBQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		if (p.d.m == M_rda) {
			var dea = exEA(p.d, 4);
			var d = ldEA(dea, 4);
			var r = sub32(d, s);
			stEA(dea, 4, r);		
			//ccna
			//return 8;  
		} else {
			var dea = exEA(p.d, p.z);
			var d = ldEA(dea, p.z);
			var r = subAuto(d, s, p.z);
			stEA(dea, p.z, r);		
			flgSub(s, d, r, p.z, false);
			//return dea.m == M_rdd ? (p.z == 4 ? 8 : 4) : (p.z == 4 ? 12 : 8) + dea.c;  
		}	
		//BUG.say(sprintf('I_SUBQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}*/
	
	function I_SUBQ(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z);
		stEA(dea, p.z, r);		
		flgSub(s, d, r, p.z, false);
		//BUG.say(sprintf('I_SUBQ.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}
	function I_SUBQA(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = sub32(d, s);
		stEA(dea, 4, r);		
		//ccna
		//BUG.say(sprintf('I_SUBQA.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	function I_SUBX(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = subAuto(d, s, p.z); if (regs.x) r = subAuto(r, 1, p.z);
		//var _x = regs.x?1:0;		
		stEA(dea, p.z, r);
		flgSub(s, d, r, p.z, true);
		//BUG.say(sprintf('I_SUBX.%s s $%08x d $%08x xo %d xn %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));
		return p.cyc;
	}
		
	/*-----------------------------------------------------------------------*/
	/* Logical */

	function I_AND(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s & d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_AND.%s s $%08x d $%08x r $%08x, cyc %d', szChr(p.z), s, d, r, p.cyc));		
		return p.cyc;	  
	}

	function I_ANDI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s & d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_ANDI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));			
		return p.cyc; 
	}

	function I_EOR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s ^ d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_EOR.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;	  
	}

	function I_EORI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s ^ d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_EORI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc; 
	}

	function I_NOT(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var m = p.z == 1 ? 0xff : (p.z == 2 ? 0xffff : 0xffffffff);
		var r = ~d & m; if (r < 0) r += 0x100000000;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_NOT.%s d $%08x r $%08x', szChr(p.z), d, r));
		return p.cyc;
	}
		  
	function I_OR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s | d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_OR.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;	  
	}

	function I_ORI(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = (s | d) >>> 0;
		stEA(dea, p.z, r);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_ORI.%s s $%08x d $%08x r $%08x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Shift and Rotate */

	function I_ASL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var v = false;
		var rm = r & p.ms;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
				if (!v && (r & p.ms) != rm) v = true;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = v;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ASL.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));			
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}
	
	function I_ASR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var sign = (r & p.ms) ? p.ms : 0;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r = (sign | (r >>> 1)) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ASR.%s num %d d $%08x r $%08x sign %d', szChr(p.z), s, d, r, sign));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_LSL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_LSL.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_LSR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r >>>= 1;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_LSR.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
				if (c) r = (r | 1) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROL.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r >>>= 1;
				if (c) r = (p.ms | r) >>> 0;
			}
			stEA(dea, p.z, r);
			regs.c = c;
		} else regs.c = false;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROR.%s num %d d $%08x r $%08x', szChr(p.z), s, d, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROXL(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var x = regs.x; //var _x = x?1:0;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & p.ms) != 0;
				r <<= 1;
				r = (r & p.mz) >>> 0;
				if (x) r = (r | 1) >>> 0;
				x = c;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = regs.x;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROXL.%s num %d d $%08x ox %d nx %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_ROXR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z) % 64;
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var n = s;
		var r = d;
		var c = false;
		var x = regs.x; //var _x = x?1:0;

		if (n > 0) {
			for (; n > 0; --n) {
				c = (r & 1) != 0;
				r >>>= 1;
				if (x) r = (p.ms | r) >>> 0;
				x = c;
			}
			stEA(dea, p.z, r);
			regs.c = regs.x = c;
		} else regs.c = regs.x;

		regs.v = false;
		regs.n = (r & p.ms) != 0;
		regs.z = r == 0;
		//BUG.say(sprintf('I_ROXR.%s num %d d $%08x ox %d nx %d r $%08x', szChr(p.z), s, d, _x, regs.x?1:0, r));		
		return [p.cyc[0] + (dea.m == M_rdd ? s << 1 : 0), 0,0]; //FIXME
	}

	function I_SWAP(p) {
		var dea = exEA(p.d, 4);
		var d = ldEA(dea, 4);
		var r = ((d << 16) | (d >>> 16)) >>> 0;
		stEA(dea, 4, r);

		regs.n = (r & 0x80000000) != 0;
		regs.z = r == 0;
		regs.v = false;
		regs.c = false;
		//BUG.say(sprintf('I_SWAP.%s d $%08x r $%08x', szChr(p.z), d, r));								
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Bit Manipulation */

	function I_BCHG(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		var r = ((d & m) ? (d & ~m) : (d | m)) >>> 0;
		stEA(dea, dz, r);
		regs.z = (d & m) == 0;

		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BCHG.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BCHG.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
			
		return p.cyc;
	}

	function I_BCLR(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		var r = (d & ~m) >>> 0;
		stEA(dea, dz, r);
		regs.z = (d & m) == 0;

		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BCLR.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BCLR.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
		return p.cyc;
	}

	function I_BSET(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		var r = (d | m) >>> 0;
		stEA(dea, dz, r);
		regs.z = (d & m) == 0;

		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BSET.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BSET.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
		return p.cyc;
	}

	function I_BTST(p) {
		var dz = p.d.m == M_rdd ? 4 : 1;
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, dz);
		var d = ldEA(dea, dz);
		var m = (1 << (s % (p.d.m == M_rdd ? 32 : 8))) >>> 0;

		regs.z = (d & m) == 0;
		
		/*if (p.d.m == M_rdd)			
			BUG.say(sprintf('I_BTST.%s s $%08x == m $%08x, d $%08x, r $%08x', szChr(p.z), s, m, d, r));
		else
			BUG.say(sprintf('I_BTST.%s s $%02x == m $%02x, d $%02x, r $%02x', szChr(p.z), s, m, d, r));*/
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Binary-Coded Decimal */

	function I_ABCD(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var x = regs.x ? 1 : 0;
		var c = false;

		var s_h = (s >> 4) & 0xf;
		var s_l = s & 0xf;
		var d_h = (d >> 4) & 0xf;
		var d_l = d & 0xf;

		var l = s_l + d_l + x;
		if (l > 9) {
			l -= 10;
			c = true;
		}
		var h = s_h + d_h + (c ? 1 : 0);
		c = false;
		if (h > 9) {
			h -= 10;
			c = true;
		}
		var r = (h << 4) | l;

		stEA(dea, p.z, r);

		regs.x = regs.c = c;
		if (r) regs.z = false;
		if (undef) {
			regs.n = !regs.n; //undef
			regs.v = !regs.v; //undef
		}
		//BUG.say(sprintf('I_ABCD.%s s $%02x d $%02x x %d | s_h %d s_l %d d_h %d d_l %d | r $%02x c %d', szChr(p.z), s, d, x, s_h, s_l, d_h, d_l, r, c?1:0));
		return p.cyc;
	}

	function I_NBCD(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var c = false;

		var d_h = (d >> 4) & 0xf;
		var d_l = d & 0xf;

		var l = 0 - d_l;
		if (l < 0) {
			l += 10;
			c = true;
		}
		var h = 0 - d_h - (c ? 1 : 0);
		c = false;
		if (h < 0) {
			h += 10;
			c = true;
		}
		var r = (h << 4) | l;

		stEA(dea, p.z, r);

		regs.x = regs.c = c;
		if (r) regs.z = false;
		if (undef) {
			regs.n = !regs.n; //undef
			regs.v = !regs.v; //undef
		}
		//BUG.say(sprintf('I_NBCD.%s s $%02x d $%02x x %d | s_h %d s_l %d d_h %d d_l %d | r $%02x c %d', szChr(p.z), s, d, x, s_h, s_l, d_h, d_l, r, c?1:0));
		return p.cyc;
	}

	function I_SBCD(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var x = regs.x ? 1 : 0;
		var c = false;

		var s_h = (s >> 4) & 0xf;
		var s_l = s & 0xf;
		var d_h = (d >> 4) & 0xf;
		var d_l = d & 0xf;

		var l = d_l - s_l - x;
		if (l < 0) {
			l += 10;
			c = true;
		}
		var h = d_h - s_h - (c ? 1 : 0);
		c = false;
		if (h < 0) {
			h += 10;
			c = true;
		}
		var r = (h << 4) | l;

		stEA(dea, p.z, r);

		regs.x = regs.c = c;
		if (r) regs.z = false;
		if (undef) {
			regs.n = !regs.n; //undef
			regs.v = !regs.v; //undef
		}
		//BUG.say(sprintf('I_SBCD.%s s $%02x d $%02x x %d | s_h %d s_l %d d_h %d d_l %d | r $%02x c %d', szChr(p.z), s, d, x, s_h, s_l, d_h, d_l, r, c?1:0));
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* Program Control */

	function I_Bcc(p) {
		var cc = p.c.cc;
		var dp = p.c.dp;
		var dp16;
		var pc;

		if (dp == 0) dp16 = nextIWord();
		//else if (dp == 255) Fatal(SAEE_CPU_68020_Required, 'cpu.I_Bcc() Full extension index detected (not a 68000 programm)');

		if (ccTrue(cc)) {
			if (dp == 0) pc = add32(regs.pc - 2, extWord(dp16));
			else pc = add32(regs.pc, extByte(dp));
			//BUG.say(sprintf('I_Bcc pc $%08x', pc));		
			setPC(pc);
			return p.cycTaken;
		}
		//ccna
		return p.cyc;
	}
			
	function I_DBcc(p) {
		var cc = p.c.cc;
		var dp = nextIWord();
		var cyc;

		if (!ccTrue(cc)) {
			var ea = exEA(new EffAddr(M_rdd, p.c.dr), p.z);
			var dr = ldEA(ea, p.z);
			
			if (dr--) {
				var pc = add32(regs.pc - 2, extWord(dp));
				setPC(pc);
				cyc = p.cycFalseTaken;
			} else {
				dr = 0xffff;
				cyc = p.cycFalse;
			}
			stEA(ea, p.z, dr);
		} else cyc = p.cycTrue;
		//ccna
		return cyc; 
	}

	function I_Scc(p) {
		//var cc = p.s.r;
		var cc = p.c.cc;
		var dea = exEA(p.d, p.z);
		//var foo = ldEA(dea, p.z); /* In the MC68000 and MC68008 a memory location is read before it is cleared. */
		var isTrue = ccTrue(cc);
		stEA(dea, p.z, isTrue ? 0xff : 0);
		//ccna
		//BUG.say(sprintf('I_S%s, cc %d, ccTrue %d, cyc %d', ccNames[cc], cc, ccTrue(cc)?1:0, isTrue ? p.cycTrue : p.cycFalse));		
		return isTrue ? p.cycTrue : p.cycFalse;
	}

	function I_BRA(p) {
		var dp = p.c.dp;
		var pc;

		if (dp == 0) {
			dp = extWord(nextIWord());
			pc = add32(regs.pc - 2, dp);
		}
		//else if (dp == 255) Fatal(SAEE_CPU_68020_Required, 'cpu.I_BRA() Full extension index detected (not a 68000 programm)');
		else pc = add32(regs.pc, extByte(dp));

		setPC(pc);
		//ccna
		return p.cycTaken; 
	}

	function I_BSR(p) {
		var dp = p.c.dp;
		var pc;

		if (dp == 0) {
			dp = extWord(nextIWord());
			pc = add32(regs.pc - 2, dp);
		}
		//else if (dp == 255) Fatal(SAEE_CPU_68020_Required, 'cpu.I_BSR() Full extension index detected (not a 68000 programm)');
		else pc = add32(regs.pc, extByte(dp));

		stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
		setPC(pc);
		//ccna
		return p.cycTaken; 
	}

	function I_JMP(p) {
		var dea = exEA(p.d, p.z);	
		setPC(dea.a);
		//ccna		
		//BUG.say(sprintf('I_JMP $%08x', dea.a));		
		return p.cyc;
	}

	function I_JSR(p) {
		var dea = exEA(p.d, p.z);
		stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
		setPC(dea.a);
		//ccna		
		//BUG.say(sprintf('I_JSR $%08x', dea.a));			
		return p.cyc;
	}

	function I_RTR(p) {
		var ccr = ldEA(exEA(new EffAddr(M_ripo, 7), 2), 2) & 0xff;
		var pc = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
		setCCR(ccr);
		setPC(pc);
		//BUG.say(sprintf('I_RTR crr $%04x pc $%08x', crr, pc));		
		return p.cyc;
	}

	function I_RTS(p) {
		var pc = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
		//BUG.say(sprintf('I_RTS() regs.pc $%08x newpc $%08x', regs.pc, pc));	
		setPC(pc);
		//ccna                                  
		return p.cyc;
	}

	function I_TST(p) {
		var dea = exEA(p.d, p.z);
		var r = ldEA(dea, p.z); //r = extAuto(r, p.z);
		flgLogical(r, p.z);
		//BUG.say(sprintf('I_TST.%s r $%08x', szChr(p.z), r));
		return p.cyc;
	}

	function I_NOP(p) {
		//BUG.say('I_NOP');	
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - CCR */

	function I_ANDI_CCR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var d = getCCR();
		var r = s & d;
		setCCR(r);
		//BUG.say(sprintf('I_ANDI_CCR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
		return p.cyc;
	}

	function I_EORI_CCR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var d = getCCR();
		var r = s ^ d;
		setCCR(r);
		//BUG.say(sprintf('I_EORI_CCR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));		
		return p.cyc;
	}

	function I_ORI_CCR(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var d = getCCR();
		var r = s | d;
		setCCR(r);
		//BUG.say(sprintf('I_ORI_CCR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
		return p.cyc;
	}

	function I_MOVE_2CCR(p) {
		var sea = exEA(p.s, p.z);
		var ccr = ldEA(sea, p.z) & 0xff;
		//BUG.say(sprintf('I_MOVE_2CCR.%s old $%02x new $%02x', szChr(p.z), getCCR(), ccr));		
		setCCR(ccr);
		return p.cyc;
	}

	/*function I_MOVE_CCR2(p) { //ups, not for the 68000
		var ccr = getCCR();
		var dea = exEA(p.d, p.z);
		stEA(dea, p.z, ccr);  	
		//ccna	
		//BUG.say(sprintf('I_MOVE_CCR2.%s $%02x', szChr(p.z), ccr));		
		return p.cyc;
	}*/

	/*-----------------------------------------------------------------------*/
	/* System Control - SR */

	function I_ANDI_SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var s = ldEA(sea, p.z);
			var d = getSR();
			var r = s & d;
			//BUG.say(sprintf('I_ANDI_SR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
			setSR(r);
			return p.cyc;
		} else {
			//BUG.say('I_ANDI_SR PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_EORI_SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var s = ldEA(sea, p.z);
			var d = getSR();
			var r = s ^ d;
			//BUG.say(sprintf('I_EORI_SR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));		
			setSR(r);
			return p.cyc;
		} else {
			//BUG.say('I_EORI_SR PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_ORI_SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var s = ldEA(sea, p.z);
			var d = getSR();
			var r = s | d;
			//BUG.say(sprintf('I_ORI_SR.%s val $%02x, old $%02x new $%02x', szChr(p.z), s, d, r));				
			setSR(r);
			return p.cyc;
		} else {
			//BUG.say('I_ORI_SR PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_MOVE_2SR(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var sr = ldEA(sea, p.z);
			//BUG.say(sprintf('I_MOVE_2SR.%s sr $%04x', szChr(p.z), sr));		 			
			setSR(sr);
			return p.cyc;
		} else {
			//BUG.say('I_MOVE_2SR PRIVILIG VIOLATION');						
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_MOVE_SR2(p) {
		var sr = getSR();
		var dea = exEA(p.d, p.z);
		//var foo = ldEA(dea, p.z); /* Memory destination is read before it is written to. */
		stEA(dea, p.z, sr);
		//ccna	
		//BUG.say(sprintf('I_MOVE_SR2.%s sr $%04x', szChr(p.z), sr));		 			
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/* System Control - USP */

	function I_MOVE_USP2A(p) {
		if (regs.s) {
			var dea = exEA(p.d, p.z);
			stEA(dea, p.z, regs.usp);
			return p.cyc;
		} else {
			//BUG.say('I_MOVE_USP PRIVILIG VIOLATION');						
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_MOVE_A2USP(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			regs.usp = ldEA(sea, p.z);
			return p.cyc;
		} else {
			//BUG.say('I_MOVE_USP PRIVILIG VIOLATION');						
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	/*-----------------------------------------------------------------------*/
	/* System Control */

	function I_CHK(p) {
		var sea = exEA(p.s, p.z);
		var s = ldEA(sea, p.z);
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);

		//BUG.say(sprintf('I_CHK.%s s $%08x d $%08x (d>s||d<0)', szChr(p.z), s, d));

		if (undef) {
			regs.z = !regs.z; //undef
			regs.v = !regs.v; //undef
			regs.c = !regs.c; //undef
		}
		if (d > s) {
			regs.n = false;
			regs.pc = fault.pc;
			return exception(6) + p.cycTaken;
		} else if (d & 0x8000) { /* 68000 word only */
			regs.n = true;
			regs.pc = fault.pc;
			return exception(6) + p.cycTaken;
		}
		return p.cyc;
	}

	function I_ILLEGAL(p) {
		var op = fault.op;
		var pc = fault.pc;

		if (op == 0x4E7B && AMIGA.mem.load32(0x10) == 0 && (pc & 0xf80000) == 0xf80000)
			Fatal(SAEE_CPU_68020_Required, 'Your Kickstart requires a 68020');

		if ((op & 0xf000) == 0xf000) {
			BUG.say(sprintf('I_ILLEGAL exception 11, line F[1111] emulator, op $%04x, pc $%08x', op, pc));
			//AMIGA.cpu.diss(fault.pc - 8, 20);
			//AMIGA.cpu.dump();
			regs.pc = fault.pc;
			return exception(11);
		} else if ((op & 0xf000) == 0xa000) {
			BUG.say(sprintf('I_ILLEGAL exception 10, line A[1010] emulator, op $%04x, pc $%08x', op, pc));
			//AMIGA.cpu.diss(fault.pc - 8, 20);
			//AMIGA.cpu.dump();
			regs.pc = fault.pc;
			return exception(10);
		}

		BUG.say(sprintf('I_ILLEGAL exception 4, op $%04x, pc $%08x', op, pc));
		//AMIGA.cpu.diss(fault.pc - 8, 20);
		//AMIGA.cpu.dump();
		regs.pc = fault.pc;
		return exception(4);
		//ccna
	}

	function I_RESET(p) {
		if (regs.s) {
			BUG.say('I_RESET()');
			AMIGA.reset();
			return p.cyc;
		} else {
			//BUG.say('I_RESET PRIVILIG VIOLATION');
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_RTE(p) {
		if (regs.s) {
			var sr = ldEA(exEA(new EffAddr(M_ripo, 7), 2), 2);
			var pc = ldEA(exEA(new EffAddr(M_ripo, 7), 4), 4);
			setSR(sr);
			//BUG.say(sprintf('I_RTE sr $%04x newpc $%08x oldpc $%08x', sr, pc, regs.pc));		
			setPC(pc);
			return p.cyc;
		} else {
			//BUG.say('I_RTE PRIVILEG VIOLATION');		
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_STOP(p) {
		if (regs.s) {
			var sea = exEA(p.s, p.z);
			var sr = ldEA(sea, p.z);
			setSR(sr);

			regs.stopped = true;
			if ((AMIGA.spcflags & SPCFLAG_DOTRACE) == 0)
				set_special(SPCFLAG_STOP);
			
			//BUG.say(sprintf('I_STOP() new sr $%04x', regs.sr));
			return p.cyc;
		} else {
			regs.pc = fault.pc;
			return exception(8);
		}
	}

	function I_TRAP(p) {
		var dea = exEA(p.d, p.z);
		var vec = ldEA(dea, p.z);
		//BUG.say(sprintf('I_TRAP exception 32 + %d', vec));										
		return exception(32 + vec);
		//ccna
	}

	function I_TRAPV(p) {
		if (regs.v) {
			BUG.say('I_TRAPV exception 7');
			return exception(7);
		}
		//ccna
		return p.cyc;
	}

	function I_TAS(p) {
		var dea = exEA(p.d, p.z);
		var d = ldEA(dea, p.z);
		var r = 0x80 | d;
		stEA(dea, p.z, r);
		regs.n = (d & 0x80) != 0;
		regs.z = d == 0;
		regs.v = false;
		regs.c = false;		
		BUG.say(sprintf('I_TAS.%s d $%02x r $%02x', szChr(p.z), d, r));	
		return p.cyc;
	}

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	
	function mkCyc(z, m) {
		/*switch (m) {
			case M_rdd:
			case M_rda: return 0;	
			case M_ria: return z == 4 ? 8 : 4;
			case M_ripo: return z == 4 ? 8 : 4;
			case M_ripr: return z == 4 ? 10 : 6;
			case M_rid: return z == 4 ? 12 : 8;
			case M_rii: return z == 4 ? 14 : 10;
			case M_pcid: return z == 4 ? 12 : 8;
			case M_pcii: return z == 4 ? 14 : 10;
			case M_absw: return z == 4 ? 12 : 8;
			case M_absl: return z == 4 ? 16 : 12;
			case M_imm:
			case M_list: return z == 4 ? 8 : 4;
		}*/		
		switch (m) {
			case M_rdd:
			case M_rda:  return z == 4 ? [ 0,0,0] : [ 0,0,0]; 
			case M_ria:  return z == 4 ? [ 8,2,0] : [ 4,1,0]; 
			case M_ripo: return z == 4 ? [ 8,2,0] : [ 4,1,0];
			case M_ripr: return z == 4 ? [10,2,0] : [ 6,1,0];
			case M_rid:  return z == 4 ? [12,3,0] : [ 8,2,0]; 
			case M_rii:  return z == 4 ? [14,3,0] : [10,2,0]; 
			case M_pcid: return z == 4 ? [12,3,0] : [ 8,2,0];
			case M_pcii: return z == 4 ? [14,3,0] : [10,2,0];
			case M_absw: return z == 4 ? [12,3,0] : [ 8,2,0];
			case M_absl: return z == 4 ? [16,4,0] : [12,3,0];
			case M_imm:
			case M_list: return z == 4 ? [ 8,2,0] : [ 4,1,0];
			default: return [0,0,0];
		}
	}

	function mkN(op, mn, cyc) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.cyc = cyc;
		return i;
	}

	function mkS(op, mn, z, s, r, cyc, add) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.s = new EffAddr(s, r);
		i.p.s.c = mkCyc(z, s);
		i.p.cyc = cyc;
		if (add) i.p.cyc[0] += i.p.s.c[0];
		i.p.cyc[1] += i.p.s.c[1];
		i.p.cyc[2] += i.p.s.c[2];
		return i;
	}

	function mkD(op, mn, z, d, r, cyc, add) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.d = new EffAddr(d, r);
		i.p.d.c = mkCyc(z, d);
		i.p.cyc = cyc;
		if (add) i.p.cyc[0] += i.p.d.c[0];
		i.p.cyc[1] += i.p.d.c[1];
		i.p.cyc[2] += i.p.d.c[2];
		return i;
	}

	function mkSD(op, mn, z, sm, sr, dm, dr, cyc, sa, da) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.ms = z == 1 ? 0x80 : (z == 2 ? 0x8000 : 0x80000000);
		i.p.mz = z == 1 ? 0xff : (z == 2 ? 0xffff : 0xffffffff);
		i.p.s = new EffAddr(sm, sr);
		i.p.d = new EffAddr(dm, dr);
		i.p.s.c = mkCyc(z, sm);
		i.p.d.c = mkCyc(z, dm);
		i.p.cyc = cyc;
		if (sa) i.p.cyc[0] += i.p.s.c[0];
		if (da) i.p.cyc[0] += i.p.d.c[0];		
		i.p.cyc[1] += i.p.s.c[1];
		i.p.cyc[2] += i.p.s.c[2];
		i.p.cyc[1] += i.p.d.c[1];		
		i.p.cyc[2] += i.p.d.c[2];		
		return i;
	}

	function mkC(op, mn, sz, cc, dp, dr, cycTaken, cyc) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = sz;
		i.p.c = new ICon(cc, dp, dr);
		if (cycTaken !== null) i.p.cycTaken = cycTaken;
		if (cyc !== null) i.p.cyc = cyc;
		return i;
	}
	
	function mkDBcc(op, mn, sz, cc, dp, dr, cycTrue, cycFalseTaken, cycFalse) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = sz;
		i.p.c = new ICon(cc, dp, dr);
		i.p.cycTrue = cycTrue;
		i.p.cycFalseTaken = cycFalseTaken;
		i.p.cycFalse = cycFalse;
		return i;
	}
	
	function mkCD(op, mn, z, cc, dp, dr, m, r, cycTrue, cycFalse, add) {
		var i = new IDef();
		i.op = op;
		i.pr = false;
		i.mn = mn;
		i.f = null;
		i.p = {};
		i.p.z = z;
		i.p.c = new ICon(cc, dp, dr);
		i.p.d = new EffAddr(m, r);
		i.p.d.c = mkCyc(z, m);
		i.p.cycTrue = cycTrue;
		i.p.cycFalse = cycFalse;
		if (add) {
			i.p.cycTrue[0] += i.p.d.c[0];
			i.p.cycFalse[0] += i.p.d.c[0];
		}
		i.p.cycTrue[1] += i.p.d.c[1];
		i.p.cycTrue[2] += i.p.d.c[2];
		i.p.cycFalse[1] += i.p.d.c[1];
		i.p.cycFalse[2] += i.p.d.c[2];
		return i;
	}
	
	function mkEA(mr, en, inv) {
		var m = (mr >> 3) & 7;
		var r = mr & 7;
		var b = inv ? (r << 3) | m : (m << 3) | r;

		if (m != 7) {
			switch (m) {
				case 0: { if (en.indexOf(M_rdd) != -1) return [b, M_rdd, r]; break; }
				case 1: { if (en.indexOf(M_rda) != -1) return [b, M_rda, r]; break; }
				case 2: { if (en.indexOf(M_ria) != -1) return [b, M_ria, r]; break; }
				case 3: { if (en.indexOf(M_ripo) != -1) return [b, M_ripo, r]; break; }
				case 4: { if (en.indexOf(M_ripr) != -1) return [b, M_ripr, r]; break; }
				case 5: { if (en.indexOf(M_rid) != -1) return [b, M_rid, r]; break; }
				case 6: { if (en.indexOf(M_rii) != -1) return [b, M_rii, r]; break; }
			}
		} else {
			if (r == 0 && en.indexOf(M_absw) != -1) return [b, M_absw, -1];
			if (r == 1 && en.indexOf(M_absl) != -1) return [b, M_absl, -1];
			if (r == 2 && en.indexOf(M_pcid) != -1) return [b, M_pcid, -1];
			if (r == 3 && en.indexOf(M_pcii) != -1) return [b, M_pcii, -1];
			if (r == 4 && en.indexOf(M_imm) != -1) return [b, M_imm, -1];
		}
		return [-1, -1, -1];
	}

	/* Start of the fun part... */
	function mkiTab() {
		var op, cnt = 0;

		iTab = new Array(0x10000);
		for (op = 0; op < 0x10000; op++) {
			iTab[op] = new IDef();
			iTab[op].op = -1;
			iTab[op].pr = false;
			iTab[op].mn = 'ILLEGAL';
			iTab[op].f = I_ILLEGAL;
			iTab[op].p = null;
		}

		//ABCD
		{
			var rm, Rx, Ry;

			for (rm = 0; rm < 2; rm++) {
				for (Rx = 0; Rx < 8; Rx++) {
					for (Ry = 0; Ry < 8; Ry++) {
						op = (12 << 12) | (Rx << 9) | (1 << 8) | (rm << 3) | Ry;

						if (iTab[op].op === -1) {
							if (rm == 0)
								iTab[op] = mkSD(op, 'ABCD', 1, M_rdd, Ry, M_rdd, Rx, [6,1,0], false, false);
							else
								iTab[op] = mkSD(op, 'ABCD', 1, M_ripr, Ry, M_ripr, Rx, [18,3,1], false, false);

							iTab[op].f = I_ABCD;
							cnt++;
						} else {
							BUG.say('OP EXISTS ABCD ' + op);
							return false;
						}
					}
				}
			}
		}
		//ADD
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								if (dir == 0 && ea[1] == M_rda && z == 0) continue; //An word and long only
								
								op = (13 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];
								
  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]);
		  								
		  						if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'ADD', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'ADD', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_ADD;
									cnt++;
								} else {
									BUG.say('OP EXISTS ADD ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//ADDA
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 0; z < 2; z++) {
				z2 = z == 0 ? 2 : 4;
				z3 = z == 0 ? 3 : 7;
				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (13 << 12) | (An << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'ADDA', z2, ea[1], ea[2], M_rda, An, z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [8,1,0], true, false);
								iTab[op].f = I_ADDA;
								cnt++;
							} else {
								BUG.say('OP EXISTS ADDA ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//ADDI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (6 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'ADDI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_ADDI;
							cnt++;
						} else {
							BUG.say('OP EXISTS ADDI ' + op);
							return false;
						}
					}
				}
			}
		}
		//ADDQ	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, id, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (id = 0; id < 8; id++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							if (ea[1] == M_rda && z == 0) continue; //An word and long only

							op = (5 << 12) | (id << 9) | (z << 6) | ea[0];
							cyc = ea[1] == M_rda ? [8,1,0] : (ea[1] == M_rdd ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]));

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'ADDQ', z2, M_imm, id == 0 ? 8 : id, ea[1], ea[2], cyc, false, ea[1] != M_rdd && ea[1] != M_rda);
								//iTab[op].f = I_ADDQ;								
								iTab[op].f = ea[1] != M_rda ? I_ADDQ : I_ADDQA;
								cnt++;
							} else {
								BUG.say('OP EXISTS ADDQ ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//ADDX
		{
			var z, z2, rm, Rx, Ry;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (rm = 0; rm < 2; rm++) {
					for (Rx = 0; Rx < 8; Rx++) {
						for (Ry = 0; Ry < 8; Ry++) {
							op = (13 << 12) | (Rx << 9) | (1 << 8) | (z << 6) | (rm << 3) | Ry;

							if (iTab[op].op === -1) {
								if (rm == 0)
									iTab[op] = mkSD(op, 'ADDX', z2, M_rdd, Ry, M_rdd, Rx, z2 == 4 ? [8,1,0] : [4,1,0], false, false);    
								else                                                                                                                     
									iTab[op] = mkSD(op, 'ADDX', z2, M_ripr, Ry, M_ripr, Rx, z2 == 4 ? [30,5,2] : [18,1,0], false, false); 

								iTab[op].f = I_ADDX;
								cnt++;
							} else {
								BUG.say('OP EXISTS ADDX ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
								return false;
							}
						}
					}
				}
			}
		}
		//AND
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								op = (12 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];

  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]);

								if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'AND', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'AND', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_AND;
									cnt++;
								} else {
									BUG.say('OP EXISTS AND ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//ANDI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (2 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'ANDI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_ANDI;
							cnt++;
						} else {
							BUG.say('OP EXISTS ANDI ' + op);
							return false;
						}
					}
				}
			}
		}
		//ANDI_CCR	
		{
			op = 0x23C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ANDI_CCR', 1, M_imm, -1, [20,3,0], false);
				iTab[op].f = I_ANDI_CCR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ANDI ' + op);
				return false;
			}
		}
		//ANDI_SR	
		{
			op = 0x27C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ANDI_SR', 2, M_imm, -1, [20,3,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_ANDI_SR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ANDI ' + op);
				return false;
			}
		}
		//ASL,ASR	
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'ASR_RI' : 'ASL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'ASR_RD' : 'ASL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_ASR : I_ASL;
									cnt++;
								} else {
									BUG.say('OP EXISTS ASx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (112 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'ASR_M' : 'ASL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_ASR : I_ASL;
							cnt++;
						} else {
							BUG.say('OP EXISTS ASx ' + op);
							return false;
						}
					}
				}
			}
		}
		//Bcc	
		{
			var cc, dp;

			for (cc = 2; cc < 16; cc++) {
				for (dp = 0; dp < 255; dp++) /* 0xff = long, 68020 only */
				{
					op = (6 << 12) | (cc << 8) | dp;

					if (iTab[op].op === -1) {
						iTab[op] = mkC(op, 'B' + ccNames[cc], dp == 0 ? 1 : 2, cc, dp, -1, [10,2,0], dp == 0 ? [12,1,0] : [8,1,0]);
						iTab[op].f = I_Bcc;
						cnt++;
					} else {
						BUG.say('OP EXISTS B' + ccNames[cc] + ' ' + op);
						return false;
					}
				}
			}
		}
		//BCHG
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (5 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BCHG1', 4, M_rdd, Dn, ea[1], ea[2], [8,1,0], false, false);
							iTab[op].f = I_BCHG;
							cnt++;
						} else {
							BUG.say('OP EXISTS BCHG1 ' + op);
							return false;
						}
					}
				}
			}
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (33 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BCHG2', 1, M_imm, -1, ea[1], ea[2], [8,1,1], false, true);
						iTab[op].f = I_BCHG;
						cnt++;
					} else {
						BUG.say('OP EXISTS BCHG2 ' + op);
						return false;
					}
				}
			}
		}
		//BCLR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (6 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BCLR1', 4, M_rdd, Dn, ea[1], ea[2], [10,1,0], false, false);
							iTab[op].f = I_BCLR;
							cnt++;
						} else {
							BUG.say('OP EXISTS BCHG1 ' + op);
							return false;
						}
					}
				}
			}
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (34 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BCLR2', 1, M_imm, - 1, ea[1], ea[2], [8,1,1], false, true);
						iTab[op].f = I_BCLR;
						cnt++;
					} else {
						BUG.say('OP EXISTS BCLR2 ' + op);
						return false;
					}
				}
			}
		}
		//BSET
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BSET1', 4, M_rdd, Dn, ea[1], ea[2], [8,1,0], false, false);
							iTab[op].f = I_BSET;
							cnt++;
						} else {
							BUG.say('OP EXISTS BSET1 ' + op);
							return false;
						}
					}
				}
			}
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (35 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BSET2', 1, M_imm, - 1, ea[1], ea[2], [8,1,1], false, true);
						iTab[op].f = I_BSET;
						cnt++;
					} else {
						BUG.say('OP EXISTS BSET2 ' + op);
						return false;
					}
				}
			}
		}
		//BTST
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (Dn << 9) | (4 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'BTST1', 4, M_rdd, Dn, ea[1], ea[2], [6,1,0], false, false);
							iTab[op].f = I_BTST;
							cnt++;
						} else {
							BUG.say('OP EXISTS BTST1 ' + op);
							return false;
						}
					}
				}
			}
			en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (32 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'BTST2', 1, M_imm, -1, ea[1], ea[2], [4,1,0], false, true);
						iTab[op].f = I_BTST;
						cnt++;
					} else {
						BUG.say('OP EXISTS BTST2 ' + op);
						return false;
					}
				}
			}
		}
		//BRA	
		{
			var dp;

			for (dp = 0; dp < 255; dp++) /* 0xff = 68020 only */
			{
				op = (96 << 8) | dp;

				if (iTab[op].op === -1) {
					iTab[op] = mkC(op, 'BRA', dp == 0 ? 1 : 2, 0, dp, -1, [10,2,0], null);
					iTab[op].f = I_BRA;
					cnt++;
				} else {
					BUG.say('OP EXISTS BRA ' + op);
					return false;
				}
			}
		}
		//BSR	
		{
			var dp;

			for (dp = 0; dp < 255; dp++) /* 0xff = 68020 only */
			{
				op = (97 << 8) | dp;

				if (iTab[op].op === -1) {
					iTab[op] = mkC(op, 'BSR', dp == 0 ? 1 : 2, 1, dp, -1, [18,2,2], null);
					iTab[op].f = I_BSR;
					cnt++;
				} else {
					BUG.say('OP EXISTS BSR ' + op);
					return false;
				}
			}
		}
		//CHK	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z2 = 2,
				z3 = 3,
				Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (4 << 12) | (Dn << 9) | (z3 << 7) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'CHK', z2, ea[1], ea[2], M_rdd, Dn, [10,1,0], true, false);
							iTab[op].f = I_CHK;
							iTab[op].p.cycTaken = iTab[op].p.s.c;
							cnt++;
						} else {
							BUG.say('OP EXISTS CHK ' + op);
							return false;
						}
					}
				}
			}
		}
		//CLR	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (66 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'CLR', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_CLR;
							cnt++;
						} else {
							BUG.say('OP EXISTS CLR ' + op);
							return false;
						}
					}
				}
			}
		}
		//CMP	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, Dn, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (Dn = 0; Dn < 8; Dn++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							if (ea[1] == M_rda && z == 0) continue; //An word and long only
							
							op = (11 << 12) | (Dn << 9) | (z << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'CMP', z2, ea[1], ea[2], M_rdd, Dn, z2 == 4 ? [6,1,0] : [4,1,0], true, false);
								iTab[op].f = I_CMP;
								cnt++;
							} else {
								BUG.say('OP EXISTS CMP ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//CMPA	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 1; z < 3; z++) {
				z2 = z == 1 ? 2 : 4;
				z3 = z == 1 ? 3 : 7;
				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (11 << 12) | (An << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'CMPA', z2, ea[1], ea[2], M_rda, An, [6,1,0], true, false);
								iTab[op].f = I_CMPA;
								cnt++;
							} else {
								BUG.say('OP EXISTS CMPA ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//CMPI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (12 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'CMPI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [14,3,0] : [8,2,0]) : (z2 == 4 ? [12,3,0] : [8,2,0]), false, ea[1] != M_rdd);
							iTab[op].f = I_CMPI;
							cnt++;
						} else {
							BUG.say('OP EXISTS CMPI ' + op);
							return false;
						}
					}
				}
			}
		}
		//CMPM
		{
			var z, z2, Ax, Ay;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (Ax = 0; Ax < 8; Ax++) {
					for (Ay = 0; Ay < 8; Ay++) {
						op = (11 << 12) | (Ax << 9) | (1 << 8) | (z << 6) | (1 << 3) | Ay;

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'CMPM', z2, M_ripo, Ay, M_ripo, Ax, z2 == 4 ? [20,5,0] : [12,3,0], false, false);
							iTab[op].f = I_CMPM;
							cnt++;
						} else {
							BUG.say('OP EXISTS CMPM ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
							return false;
						}
					}
				}
			}
		}
		//DBcc
		{
			var cc, dr;

			for (cc = 0; cc < 16; cc++) {
				for (dr = 0; dr < 8; dr++) {
					op = (5 << 12) | (cc << 8) | (25 << 3) | dr;

					if (iTab[op].op === -1) {
						iTab[op] = mkDBcc(op, 'DB' + ccNames[cc], 2, cc, -1, dr, [12,2,0], [10,2,0], [14,3,0]);
						iTab[op].f = I_DBcc;
						cnt++;
					} else {
						BUG.say('OP EXISTS DBcc ' + op);
						return false;
					}
				}
			}
		}
		//DIVS	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (8 << 12) | (Dn << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'DIVS', 2, ea[1], ea[2], M_rdd, Dn, [158,1,0], true, false);
							iTab[op].f = I_DIVS;
							cnt++;
						} else {
							BUG.say('OP EXISTS DIVS ' + op);
							return false;
						}
					}
				}
			}
		}
		//DIVU	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (8 << 12) | (Dn << 9) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'DIVU', 2, ea[1], ea[2], M_rdd, Dn, [140,1,0], true, false);
							iTab[op].f = I_DIVU;
							cnt++;
						} else {
							BUG.say('OP EXISTS DIVU ' + op);
							return false;
						}
					}
				}
			}
		}
		//EOR
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, z3, Dn, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				z3 = z == 0 ? 4 : (z == 1 ? 5 : 6);
				for (Dn = 0; Dn < 8; Dn++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (11 << 12) | (Dn << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'EOR', z2, M_rdd, Dn, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), false, true);
								iTab[op].f = I_EOR;
								cnt++;
							} else {
								BUG.say('OP EXISTS EOR ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//EORI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (10 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'EORI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_EORI;
							cnt++;
						} else {
							BUG.say('OP EXISTS EORI ' + op);
							return false;
						}
					}
				}
			}
		}
		//EORI_CCR	
		{
			op = 0xA3C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'EORI_CCR', 1, M_imm, -1, [20,3,0], false);
				iTab[op].f = I_EORI_CCR;
				cnt++;
			} else {
				BUG.say('OP EXISTS EORI ' + op);
				return false;
			}
		}
		//EORI_SR	
		{
			op = 0xA7C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'EORI_SR', 2, M_imm, -1, [20,3,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_EORI_SR;
				cnt++;
			} else {
				BUG.say('OP EXISTS EORI ' + op);
				return false;
			}
		}
		//EXG
		{
			var m, opm, Rx, Ry;

			for (m = 0; m < 3; m++) {
				opm = m == 0 ? 8 : (m == 1 ? 9 : 17);
				for (Rx = 0; Rx < 8; Rx++) {
					for (Ry = 0; Ry < 8; Ry++) {
						op = (12 << 12) | (Rx << 9) | (1 << 8) | (opm << 3) | Ry;

						if (iTab[op].op === -1) {
							if (m == 0)
								iTab[op] = mkSD(op, 'EXG', 4, M_rdd, Rx, M_rdd, Ry, [6,1,0], false, false);
							else if (m == 1)
								iTab[op] = mkSD(op, 'EXG', 4, M_rda, Rx, M_rda, Ry, [6,1,0], false, false);
							else
								iTab[op] = mkSD(op, 'EXG', 4, M_rdd, Rx, M_rda, Ry, [6,1,0], false, false);

							iTab[op].f = I_EXG;
							cnt++;
						} else {
							BUG.say('OP EXISTS EXG ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
							return false;
						}
					}
				}
			}
		}
		//EXT
		{
			var z, z2, opm, Dn;

			for (z = 1; z < 3; z++) {
				z2 = z == 1 ? 2 : 4;
				opm = z == 1 ? 2 : 3;
				for (Dn = 0; Dn < 8; Dn++) {
					op = (36 << 9) | (opm << 6) | Dn;

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'EXT', z2, M_rdd, Dn, [4,1,0], false);
						iTab[op].f = I_EXT;
						cnt++;
					} else {
						BUG.say('OP EXISTS EXT ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
						return false;
					}
				}
			}
		}
		//ILLEGAL	
		{
			op = 0x4AFC;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'ILLEGAL', [0,0,0]);
				iTab[op].f = I_ILLEGAL;
				cnt++;
			} else {
				BUG.say('OP EXISTS ILLEGAL ' + op);
				return false;
			}
		}
		//JMP	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var mr, ea, cyc;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (315 << 6) | ea[0];

					if (iTab[op].op === -1) {   
						switch (ea[1]) {
							case M_ria:  cyc = [ 8,2,0]; break;
							case M_rid:  cyc = [10,2,0]; break;
							case M_rii:  cyc = [14,3,0]; break;
							case M_pcid: cyc = [10,2,0]; break;
							case M_pcii: cyc = [14,3,0]; break;
							case M_absw: cyc = [10,2,0]; break;
							case M_absl: cyc = [12,3,0]; break;
						}		
						iTab[op] = mkD(op, 'JMP', 0, ea[1], ea[2], cyc, false);
						iTab[op].f = I_JMP;
						cnt++;
					} else {
						BUG.say('OP EXISTS JMP ' + op);
						return false;
					}
				}
			}
		}
		//JSR	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var mr, ea, cyc;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (314 << 6) | ea[0];

					if (iTab[op].op === -1) {
						switch (ea[1]) {
							case M_ria:  cyc = [16,2,2]; break;
							case M_rid:  cyc = [18,2,2]; break;
							case M_rii:  cyc = [22,2,2]; break;
							case M_pcid: cyc = [18,2,2]; break;
							case M_pcii: cyc = [22,2,2]; break;
							case M_absw: cyc = [18,2,2]; break;
							case M_absl: cyc = [20,3,2]; break;
						}		
						iTab[op] = mkD(op, 'JSR', 0, ea[1], ea[2], cyc, false);
						iTab[op].f = I_JSR;
						cnt++;
					} else {
						BUG.say('OP EXISTS JSR ' + op);
						return false;
					}
				}
			}
		}
		//LEA	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var An, mr, ea, cyc;

			for (An = 0; An < 8; An++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (4 << 12) | (An << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							switch (ea[1]) {
								case M_ria:  cyc = [ 4,1,0]; break;
								case M_rid:  cyc = [ 8,2,0]; break;
								case M_rii:  cyc = [12,2,0]; break;
								case M_pcid: cyc = [ 8,2,0]; break;
								case M_pcii: cyc = [12,2,0]; break;
								case M_absw: cyc = [ 8,2,0]; break;
								case M_absl: cyc = [12,3,0]; break;
							}
							iTab[op] = mkSD(op, 'LEA', 4, ea[1], ea[2], M_rda, An, cyc, false, false);
							iTab[op].f = I_LEA;
							cnt++;
						} else {
							BUG.say('OP EXISTS LEA ' + op);
							return false;
						}
					}
				}
			}
		}
		//LINK		
		{
			var An;

			for (An = 0; An < 8; An++) {
				op = (2506 << 3) | An;

				if (iTab[op].op === -1) {
					iTab[op] = mkSD(op, 'LINK', 2, M_rda, An, M_imm, -1, [16,2,2], false, false);
					iTab[op].f = I_LINK;
					cnt++;
				} else {
					BUG.say('OP EXISTS LINK ' + op);
					return false;
				}
			}
		}
		//LSL,LSR
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (1 << 3) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'LSR_RI' : 'LSL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'LSR_RD' : 'LSL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_LSR : I_LSL;
									cnt++;
								} else {
									BUG.say('OP EXISTS LSx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (113 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'LSR_M' : 'LSL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_LSR : I_LSL;
							cnt++;
						} else {
							BUG.say('OP EXISTS LSx ' + op);
							return false;
						}
					}
				}
			}
		}
		//MOVE	
		{    
			var tab2 = [
				[[ 4,1,0],null,[ 8,1,1],[ 8,1,1],[ 8,1,1],[12,2,1],[14,2,1],null,null,[12,2,1],[16,3,1],null],
				[[ 4,1,0],null,[ 8,1,1],[ 8,1,1],[ 8,1,1],[12,2,1],[14,2,1],null,null,[12,2,1],[16,3,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null],
				[[10,2,0],null,[14,2,1],[14,2,1],[14,2,1],[18,3,1],[20,4,1],null,null,[18,3,1],[22,4,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[14,3,0],null,[18,3,1],[18,3,1],[18,3,1],[22,4,1],[24,4,1],null,null,[22,4,1],[26,5,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[14,3,0],null,[18,3,1],[18,3,1],[18,3,1],[22,4,1],[24,4,1],null,null,[22,4,1],[26,5,1],null],
				[[12,3,0],null,[16,3,1],[16,3,1],[16,3,1],[20,4,1],[22,4,1],null,null,[20,4,1],[24,5,1],null],
				[[16,4,0],null,[20,4,1],[20,4,1],[20,4,1],[24,5,1],[26,5,1],null,null,[24,5,1],[28,6,1],null],
				[[ 8,2,0],null,[12,2,1],[12,2,1],[12,2,1],[16,3,1],[18,3,1],null,null,[16,3,1],[20,4,1],null]
			];	
			var tab4 = [
				[[ 4,1,0],null,[12,1,2],[12,1,2],[12,1,2],[16,2,2],[18,2,2],null,null,[16,2,2],[20,3,2],null],
				[[ 4,1,0],null,[12,1,2],[12,1,2],[12,1,2],[16,2,2],[18,2,2],null,null,[16,2,2],[20,3,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null],
				[[14,3,0],null,[22,3,2],[22,3,2],[22,3,2],[26,4,2],[28,4,2],null,null,[26,4,2],[30,5,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,6,2],null],
				[[18,4,0],null,[26,4,2],[26,4,2],[26,4,2],[30,5,2],[32,5,2],null,null,[30,5,2],[34,6,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,5,2],null],
				[[18,4,0],null,[26,4,2],[26,4,2],[26,4,2],[30,5,2],[32,5,2],null,null,[30,5,2],[34,6,2],null],
				[[16,4,0],null,[24,4,2],[24,4,2],[24,4,2],[28,5,2],[30,5,2],null,null,[28,5,2],[32,6,2],null],
				[[20,5,0],null,[28,5,2],[28,5,2],[28,5,2],[32,6,2],[34,6,2],null,null,[32,6,2],[36,7,2],null],
				[[12,3,0],null,[20,3,2],[20,3,2],[20,3,2],[24,4,2],[26,4,2],null,null,[24,4,2],[28,5,2],null]			
			];				
			var sen = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var den = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, z3, smr, dmr, sea, dea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				z3 = z == 0 ? 1 : (z == 1 ? 3 : 2);

				for (dmr = 0; dmr < 64; dmr++) {
					dea = mkEA(dmr, den, 1);
					if (dea[0] != -1) {
						for (smr = 0; smr < 64; smr++) {
							sea = mkEA(smr, sen, 0);
							if (sea[0] != -1) {
								if (sea[1] == M_rda && z == 0) //For byte size operation, address register direct is not allowed.
									continue;
								
								op = (z3 << 12) | (dea[0] << 6) | sea[0];

								if (iTab[op].op === -1) {
									iTab[op] = mkSD(op, 'MOVE', z2, sea[1], sea[2], dea[1], dea[2], z2 == 4 ? tab4[sea[1]-1][dea[1]-1] : tab2[sea[1]-1][dea[1]-1], false, false);
									iTab[op].f = I_MOVE;
									//iTab[op].p.cyc = z2 == 4 ? tab4[sea[1]-1][dea[1]-1] : tab2[sea[1]-1][dea[1]-1];
									//if (typeof(iTab[op].p.cyc) != 'number') console.log(op, z2, sea[1], dea[1]);
									cnt++;
								} else {
									BUG.say('OP EXISTS MOVE op ' + op + ', size ' + z2 + ', sm ' + sea[1] + ', sr ' + sea[2] + ', dm ' + dea[1] + ', dr ' + dea[2]);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//MOVEA	
		{
			var tab2 = [
				[ 4,1,0],
				[ 4,1,0],
				[ 8,2,0],
				[ 8,2,0],
				[10,2,0],
				[12,3,0],
				[14,3,0],
				[12,3,0],
				[14,3,0],
				[12,3,0],
				[16,4,0],
				[ 8,2,0]
			];	
			var tab4 = [
				[ 4,1,0],
				[ 4,1,0],
				[12,3,0],
				[12,3,0],
				[14,3,0],
				[16,4,0],
				[18,4,0],
				[16,4,0],
				[18,4,0],
				[16,4,0],
				[20,5,0],
				[12,3,0]			
			];	
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 1; z < 3; z++) {
				z2 = z == 1 ? 2 : 4;
				z3 = z == 1 ? 3 : 2;

				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (z3 << 12) | (An << 9) | (1 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'MOVEA', z2, ea[1], ea[2], M_rda, An, z2 == 4 ? tab4[ea[1]-1] : tab2[ea[1]-1], false, false);
								iTab[op].f = I_MOVEA;
								//iTab[op].p.cyc = z2 == 4 ? tab4[ea[1]-1] : tab2[ea[1]-1];
								cnt++;
							} else {
								BUG.say('OP EXISTS MOVEA op ' + op + ', size ' + z2 + ', sm ' + sea[1] + ', sr ' + sea[2] + ', dm ' + dea[1] + ', dr ' + dea[2]);
								return false;
							}
						}
					}
				}
			}
		}
		//MOVE_CCR2 ups, not for the 68000
		/*{
			var en = [M_rdd,M_ria,M_ripo,M_ripr,M_rid,M_rii,M_absw,M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++)
			{
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1)
				{
					op = (267 << 6) | ea[0];  

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'MOVE_CCR2', 2, ea[1], ea[2], [0,0,0], false);
						iTab[op].f = I_MOVE_CCR2;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_CCR2 '+op);
						return false;
					}
				}
			}
		}*/
		//MOVE_2CCR	     
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (275 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkS(op, 'MOVE_2CCR', 2, ea[1], ea[2], [12,1,0], ea[1] != M_rdd);
						iTab[op].f = I_MOVE_2CCR;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_2CCR ' + op);
						return false;
					}
				}
			}
		}
		//MOVE_SR2
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (259 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'MOVE_SR2', 2, ea[1], ea[2], ea[1] == M_rdd ? [6,1,0] : [8,1,1], ea[1] != M_rdd);
						iTab[op].f = I_MOVE_SR2;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_SR2 ' + op);
						return false;
					}
				}
			}
		}
		//MOVE_2SR	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (283 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkS(op, 'MOVE_2SR', 2, ea[1], ea[2], [12,1,0], ea[1] != M_rdd);
						iTab[op].pr = true;
						iTab[op].f = I_MOVE_2SR;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_2SR ' + op);
						return false;
					}
				}
			}
		}
		//MOVE_USP
		{
			var dr, An;

			for (dr = 0; dr < 2; dr++) {
				for (An = 0; An < 8; An++) {
					op = (1254 << 4) | (dr << 3) | An;

					if (iTab[op].op === -1) {
						if (dr == 0)
							iTab[op] = mkS(op, 'MOVE_A2USP', 4, M_rda, An, [4,1,0], false);
						else
							iTab[op] = mkD(op, 'MOVE_USP2A', 4, M_rda, An, [4,1,0], false);

						iTab[op].pr = true;
						iTab[op].f = (dr == 0) ? I_MOVE_A2USP : I_MOVE_USP2A;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVE_USP ' + op);
						return false;
					}
				}
			}
		}
		//MOVEM
		/*		
		instr	size	(An)		(An)+	-(An)	d(An)	   	d(An,ix)+   d(PC)      d(PC,ix)*     xxx.W      xxx.L                    
		MOVEM	                                                                                                                  
			word	   12+4n	   12+4n	  -	  16+4n       18+4n     16+4n      18+4n          16+4n      20+4n	                  
		M->R		 (3+n/0)	 (3+n/0)	  -	(4+n/0)     (4+n/0)   (4+n/0)    (4+n/0)        (4+n/0)    (5+n/0)	                  
			long	   12+8n	   12+8n	  -	  16+8n       18+8n     16+8n      18+8n          16+8n      20+8n	                  
					(3+2n/0)	(3+2n/0)	  -    (4+2n/0)   (4+2n/0)   (4+2n/0)   (4+2n/0)     (4+2n/0)   (5+2n/0)  
					                 
		MOVEM	                                                                                                                  
			word	    8+4n	   -		  8+4n	  12+4n    14+4n     -				-              12+4n      16+4n	                        
		R->M		   (2/n)	   -		 (2/n)	  (3/n)    (3/n)     -				-              (3/n)      (4/n)	                        
			long	    8+8n	   -		  8+8n	  12+8n    14+8n     -				-              12+8n      16+8n	                        
		 			 (2/2n)	   -		(2/2n)	 (3/2n)    (3/2n)  	 -				-		         (3/2n)     (4/2n)*/
		{
			var z, z2, dr, mr, ea, cyc;

			for (z = 0; z < 2; z++) {
				z2 = z == 0 ? 2 : 4;
				for (dr = 0; dr < 2; dr++) {
					if (dr == 0) en = [M_ria, M_ripr, M_rid, M_rii, M_absw, M_absl];
					else en = [M_ria, M_ripo, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];

					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (9 << 11) | (dr << 10) | (1 << 7) | (z << 6) | ea[0];

							if (iTab[op].op === -1) {
								if (dr == 0) {
									switch (ea[1]) {
										case M_ria: cyc = [8,2,0]; break;
										case M_ripr: cyc = [8,2,0]; break;
										case M_rid: cyc = [12,3,0]; break;
										case M_rii: cyc = [14,3,0]; break;
										case M_absw: cyc = [12,3,0]; break;
										case M_absl: cyc = [16,4,0]; break;
									}		
									iTab[op] = mkSD(op, 'MOVEM_R2M', z2, M_list, -1, ea[1], ea[2], cyc, false, false);
									iTab[op].f = I_MOVEM_R2M;
								} else {
									switch (ea[1]) {
										case M_ria: cyc = [12,3,0]; break;
										case M_ripo: cyc = [12,3,0]; break;
										case M_rid: cyc = [16,4,0]; break;
										case M_rii: cyc = [18,4,0]; break;
										case M_pcid: cyc = [16,4,0]; break;
										case M_pcii: cyc = [18,4,0]; break;
										case M_absw: cyc = [16,4,0]; break;
										case M_absl: cyc = [20,5,0]; break;
									}		
									iTab[op] = mkSD(op, 'MOVEM_M2R', z2, M_list, -1, ea[1], ea[2], cyc, false, false);
									iTab[op].f = I_MOVEM_M2R;
								}
								cnt++;
							} else {
								BUG.say('OP EXISTS MOVEM ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//MOVEP
		{
			var m, opm, Dn, An;

			for (m = 0; m < 4; m++) {
				opm = m + 4;
				for (Dn = 0; Dn < 8; Dn++) {
					for (An = 0; An < 8; An++) {
						op = (Dn << 9) | (opm << 6) | (1 << 3) | An;

						if (iTab[op].op === -1) {
							if (m == 0)
								iTab[op] = mkSD(op, 'MOVEP', 2, M_rid, An, M_rdd, Dn, [16,4,0], false, false);
							else if (m == 1)
								iTab[op] = mkSD(op, 'MOVEP', 4, M_rid, An, M_rdd, Dn, [24,6,0], false, false);
							else if (m == 2)
								iTab[op] = mkSD(op, 'MOVEP', 2, M_rdd, Dn, M_rid, An, [16,2,2], false, false);
							else
								iTab[op] = mkSD(op, 'MOVEP', 4, M_rdd, Dn, M_rid, An, [24,2,4], false, false);

							iTab[op].f = I_MOVEP;
							cnt++;
						} else {
							BUG.say('OP EXISTS MOVEP ' + op);
							return false;
						}
					}
				}
			}
		}
		//MOVEQ	
		{
			var Dn, d;

			for (Dn = 0; Dn < 8; Dn++) {
				for (d = 0; d < 256; d++) {
					op = (7 << 12) | (Dn << 9) | d;

					if (iTab[op].op === -1) {
						iTab[op] = mkSD(op, 'MOVEQ', 4, M_imm, d, M_rdd, Dn, [4,1,0], false, false);
						iTab[op].f = I_MOVEQ;
						cnt++;
					} else {
						BUG.say('OP EXISTS MOVEQ ' + op);
						return false;
					}
				}
			}
		}
		//MULS	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (12 << 12) | (Dn << 9) | (7 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'MULS', 2, ea[1], ea[2], M_rdd, Dn, [70,1,0], true, false);
							iTab[op].f = I_MULS;
							cnt++;
						} else {
							BUG.say('OP EXISTS MULS ' + op);
							return false;
						}
					}
				}
			}
		}
		//MULU	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var Dn, mr, ea;

			for (Dn = 0; Dn < 8; Dn++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (12 << 12) | (Dn << 9) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'MULU', 2, ea[1], ea[2], M_rdd, Dn, [70,1,0], true, false);
							iTab[op].f = I_MULU;
							cnt++;
						} else {
							BUG.say('OP EXISTS MULU ' + op);
							return false;
						}
					}
				}
			}
		}
		//NBCD
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (288 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'NBCD', 1, ea[1], ea[2], ea[1] == M_rdd ? [6,1,0] : [8,1,1], ea[1] != M_rdd);
						iTab[op].f = I_NBCD;
						cnt++;
					} else {
						BUG.say('OP EXISTS NBCD ' + op);
						return false;
					}
				}
			}
		}
		//NEG	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (68 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'NEG', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_NEG;
							cnt++;
						} else {
							BUG.say('OP EXISTS NEG ' + op);
							return false;
						}
					}
				}
			}
		}
		//NEGX	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (64 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'NEGX', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_NEGX;
							cnt++;
						} else {
							BUG.say('OP EXISTS NEGX ' + op);
							return false;
						}
					}
				}
			}
		}
		//NOP	
		{
			op = 0x4E71;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'NOP', [4,1,0]);
				iTab[op].f = I_NOP;
				cnt++;
			} else {
				BUG.say('OP EXISTS NOP ' + op);
				return false;
			}
		}
		//NOT	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (70 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'NOT', z2, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [6,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]), ea[1] != M_rdd);
							iTab[op].f = I_NOT;
							cnt++;
						} else {
							BUG.say('OP EXISTS NOT ' + op);
							return false;
						}
					}
				}
			}
		}
		//OR
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								op = (8 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];

  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [4,1,0])) : (z2 == 4 ? [12,1,2] : [8,1,1]);

								if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'OR', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'OR', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_OR;
									cnt++;
								} else {
									BUG.say('OP EXISTS OR ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//ORI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'ORI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_ORI;
							cnt++;
						} else {
							BUG.say('OP EXISTS ORI ' + op);
							return false;
						}
					}
				}
			}
		}
		//ORI_CCR	
		{
			op = 0x3C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ORI_CCR', 1, M_imm, -1, [20,3,0], false);
				iTab[op].f = I_ORI_CCR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ORI_CCR ' + op);
				return false;
			}
		}
		//ORI_SR	
		{
			op = 0x7C;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'ORI_SR', 2, M_imm, -1, [20,3,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_ORI_SR;
				cnt++;
			} else {
				BUG.say('OP EXISTS ORI_SR ' + op);
				return false;
			}
		}		 	 
		//PEA	
		{
			var en = [M_ria, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl];
			var mr, ea, cyc;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (289 << 6) | ea[0];

					if (iTab[op].op === -1) {
						switch (ea[1]) {
							case M_ria: cyc = [12,1,2]; break;   
							case M_rid: cyc = [16,2,2]; break;
							case M_rii: cyc = [20,2,2]; break;
							case M_pcid: cyc = [16,2,2]; break;
							case M_pcii: cyc = [20,2,2]; break;
							case M_absw: cyc = [16,2,2]; break;
							case M_absl: cyc = [20,3,2]; break;
						}		
						iTab[op] = mkS(op, 'PEA', 4, ea[1], ea[2], cyc, false);
						iTab[op].f = I_PEA;
						cnt++;
					} else {
						BUG.say('OP EXISTS PEA ' + op);
						return false;
					}
				}
			}
		}
		//RESET	
		{
			op = 0x4E70;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RESET', [132,1,0]);
				iTab[op].f = I_RESET;
				cnt++;
			} else {
				BUG.say('OP EXISTS RESET ' + op);
				return false;
			}
		}
		//ROL,ROR
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (3 << 3) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'ROR_RI' : 'ROL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'ROR_RD' : 'ROL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_ROR : I_ROL;
									cnt++;
								} else {
									BUG.say('OP EXISTS ROx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (115 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'ROR_M' : 'ROL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_ROR : I_ROL;
							cnt++;
						} else {
							BUG.say('OP EXISTS ROx ' + op);
							return false;
						}
					}
				}
			}
		}
		//ROXL,ROXR
		{
			var en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, dr, ir, cr, Dy, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);

				for (dr = 0; dr < 2; dr++) {
					for (ir = 0; ir < 2; ir++) {
						for (cr = 0; cr < 8; cr++) {
							for (Dy = 0; Dy < 8; Dy++) {
								op = (14 << 12) | (cr << 9) | (dr << 8) | (z << 6) | (ir << 5) | (2 << 3) | Dy;

								if (iTab[op].op === -1) {
									if (ir == 0)
										iTab[op] = mkSD(op, dr == 0 ? 'ROXR_RI' : 'ROXL_RI', z2, M_imm, cr == 0 ? 8 : cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);
									else
										iTab[op] = mkSD(op, dr == 0 ? 'ROXR_RD' : 'ROXL_RD', z2, M_rdd, cr, M_rdd, Dy, z2 == 4 ? [8,1,0] : [6,1,0], false, false);

									iTab[op].f = dr == 0 ? I_ROXR : I_ROXL;
									cnt++;
								} else {
									BUG.say('OP EXISTS ROx ' + op);
									return false;
								}
							}
						}
					}
				}
			}
			for (dr = 0; dr < 2; dr++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (114 << 9) | (dr << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, dr == 0 ? 'ROXR_M' : 'ROXL_M', 2, M_imm, 1, ea[1], ea[2], [8,1,1], false, true);
							iTab[op].f = dr == 0 ? I_ROXR : I_ROXL;
							cnt++;
						} else {
							BUG.say('OP EXISTS ROx ' + op);
							return false;
						}
					}
				}
			}
		}
		//RTE	
		{
			op = 0x4E73;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RTE', [20,5,0]);
				iTab[op].pr = true;
				iTab[op].f = I_RTE;
				cnt++;
			} else {
				BUG.say('OP EXISTS RTE ' + op);
				return false;
			}
		}
		//RTR	
		{
			op = 0x4E77;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RTR', [20,5,0]);
				iTab[op].f = I_RTR;
				cnt++;
			} else {
				BUG.say('OP EXISTS RTR ' + op);
				return false;
			}
		}
		//RTS	
		{
			op = 0x4E75;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'RTS', [16,4,0]);
				iTab[op].f = I_RTS;
				cnt++;
			} else {
				BUG.say('OP EXISTS RTS ' + op);
				return false;
			}
		}
		//SBCD
		{
			var rm, Rx, Ry;

			for (rm = 0; rm < 2; rm++) {
				for (Rx = 0; Rx < 8; Rx++) {
					for (Ry = 0; Ry < 8; Ry++) {
						op = (8 << 12) | (Ry << 9) | (1 << 8) | (rm << 3) | Rx;

						if (iTab[op].op === -1) {
							if (rm == 0)
								iTab[op] = mkSD(op, 'SBCD', 1, M_rdd, Rx, M_rdd, Ry,  [6,3,1], false, false);
							else
								iTab[op] = mkSD(op, 'SBCD', 1, M_ripr, Rx, M_ripr, Ry,  [18,3,1], false, false);

							iTab[op].f = I_SBCD;
							cnt++;
						} else {
							BUG.say('OP EXISTS SBCD ' + op);
							return false;
						}
					}
				}
			}
		}
		//Scc	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var cc, mr, ea;

			for (cc = 0; cc < 16; cc++) {
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (5 << 12) | (cc << 8) | (3 << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkCD(op, 'S' + ccNames[cc], 1, cc, -1, -1, ea[1], ea[2], ea[1] == M_rdd ? [6,1,0] : [8,1,1], ea[1] == M_rdd ? [4,1,0] : [8,1,1], ea[1] != M_rdd);
							iTab[op].f = I_Scc;
							cnt++;
						} else {
							BUG.say('OP EXISTS S' + ccNames[cc] + ' ' + op);
							return false;
						}
					}
				}
			}
		}
		//STOP	
		{
			op = 0x4E72;

			if (iTab[op].op === -1) {
				iTab[op] = mkS(op, 'STOP', 2, M_imm, -1, [4,0,0], false);
				iTab[op].pr = true;
				iTab[op].f = I_STOP;
				cnt++;
			} else {
				BUG.say('OP EXISTS STOP ' + op);
				return false;
			}
		}
		//SUB
		{
			var z, z2, dir, en, Dn, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (dir = 0; dir < 2; dir++) {
					if (dir == 0) en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
					else en = [M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];

					for (Dn = 0; Dn < 8; Dn++) {
						for (mr = 0; mr < 64; mr++) {
							ea = mkEA(mr, en, 0);
							if (ea[0] != -1) {
								if (dir == 0 && ea[1] == M_rda && z == 0) //For byte-sized operation, address register direct is not allowed
								continue;

								op = (9 << 12) | (Dn << 9) | (dir << 8) | (z << 6) | ea[0];

  								cyc = dir == 0 ? (z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]);
								
								if (iTab[op].op === -1) {
									if (dir == 0)
										iTab[op] = mkSD(op, 'SUB', z2, ea[1], ea[2], M_rdd, Dn, cyc, true, false);
									else
										iTab[op] = mkSD(op, 'SUB', z2, M_rdd, Dn, ea[1], ea[2], cyc, false, true);

									iTab[op].f = I_SUB;
									cnt++;
								} else {
									BUG.say('OP EXISTS SUB ' + op);
									return false;
								}
							}
						}
					}
				}
			}
		}
		//SUBA
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_pcid, M_pcii, M_absw, M_absl, M_imm];
			var z, z2, z3, An, mr, ea;

			for (z = 0; z < 2; z++) {
				z2 = z == 0 ? 2 : 4;
				z3 = z == 0 ? 3 : 7;
				for (An = 0; An < 8; An++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							op = (9 << 12) | (An << 9) | (z3 << 6) | ea[0];

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'SUBA', z2, ea[1], ea[2], M_rda, An, z2 == 4 ? (ea[1] == M_rdd || ea[1] == M_imm ? [8,1,0] : [6,1,0]) : [8,1,0], true, false);
								iTab[op].f = I_SUBA;
								cnt++;
							} else {
								BUG.say('OP EXISTS SUBA ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//SUBI	
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (4 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkSD(op, 'SUBI', z2, M_imm, -1, ea[1], ea[2], ea[1] == M_rdd ? (z2 == 4 ? [16,3,0] : [8,2,0]) : (z2 == 4 ? [20,3,2] : [12,2,1]), false, ea[1] != M_rdd);
							iTab[op].f = I_SUBI;
							cnt++;
						} else {
							BUG.say('OP EXISTS SUBI ' + op);
							return false;
						}
					}
				}
			}
		}
		//SUBQ	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var z, z2, id, mr, ea, cyc;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (id = 0; id < 8; id++) {
					for (mr = 0; mr < 64; mr++) {
						ea = mkEA(mr, en, 0);
						if (ea[0] != -1) {
							if (ea[1] == M_rda && z == 0) continue; //An word and long only
							
							op = (5 << 12) | (id << 9) | (1 << 8) | (z << 6) | ea[0];
							cyc = ea[1] == M_rda ? [8,1,0] : (ea[1] == M_rdd ? (z2 == 4 ? [8,1,0] : [4,1,0]) : (z2 == 4 ? [12,1,2] : [8,1,1]));

							if (iTab[op].op === -1) {
								iTab[op] = mkSD(op, 'SUBQ', z2, M_imm, id == 0 ? 8 : id, ea[1], ea[2], cyc, false, ea[1] != M_rdd && ea[1] != M_rda);
								//iTab[op].f = I_SUBQ;
								iTab[op].f = ea[1] != M_rda ? I_SUBQ : I_SUBQA;
								cnt++;
							} else {
								BUG.say('OP EXISTS SUBQ ' + op);
								return false;
							}
						}
					}
				}
			}
		}
		//SUBX
		{
			var z, z2, rm, Rx, Ry;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (rm = 0; rm < 2; rm++) {
					for (Rx = 0; Rx < 8; Rx++) {
						for (Ry = 0; Ry < 8; Ry++) {
							op = (9 << 12) | (Ry << 9) | (1 << 8) | (z << 6) | (rm << 3) | Rx;

							if (iTab[op].op === -1) {
								if (rm == 0)
									iTab[op] = mkSD(op, 'SUBX', z2, M_rdd, Rx, M_rdd, Ry, z2 == 4 ? [8,1,0] : [4,1,0], false, false);
								else
									iTab[op] = mkSD(op, 'SUBX', z2, M_ripr, Rx, M_ripr, Ry, z2 == 4 ?  [30,5,2] : [18,1,0], false, false);

								iTab[op].f = I_SUBX;
								cnt++;
							} else {
								BUG.say('OP EXISTS SUBX ' + op + ' ' + iTab[op].mn + ' ' + iTab[op].p.s.r + ' ' + iTab[op].p.d.r);
								return false;
							}
						}
					}
				}
			}
		}
		//SWAP		
		{
			var Dn;

			for (Dn = 0; Dn < 8; Dn++) {
				op = (2312 << 3) | Dn;

				if (iTab[op].op === -1) {
					iTab[op] = mkD(op, 'SWAP', 2, M_rdd, Dn, [4,1,0], false);
					iTab[op].f = I_SWAP;
					cnt++;
				} else {
					BUG.say('OP EXISTS SWAP ' + op);
					return false;
				}
			}
		}
		//TAS
		{
			var en = [M_rdd, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl];
			var mr, ea;

			for (mr = 0; mr < 64; mr++) {
				ea = mkEA(mr, en, 0);
				if (ea[0] != -1) {
					op = (299 << 6) | ea[0];

					if (iTab[op].op === -1) {
						iTab[op] = mkD(op, 'TAS', 1, ea[1], ea[2], ea[1] == M_rdd ? [4,1,0] : [10,1,1], ea[1] != M_rdd);
						iTab[op].f = I_TAS;
						cnt++;
					} else {
						BUG.say('OP EXISTS TAS ' + op);
						return false;
					}
				}
			}
		}
		//TRAP		
		{
			var v;

			for (v = 0; v < 16; v++) {
				op = (1252 << 4) | v;

				if (iTab[op].op === -1) {
					iTab[op] = mkD(op, 'TRAP', 0, M_imm, v, [38,4,3], false);
					iTab[op].f = I_TRAP;
					cnt++;
				} else {
					BUG.say('OP EXISTS TRAP ' + op);
					return false;
				}
			}
		}
		//TRAPV	
		{
			op = 0x4E76;

			if (iTab[op].op === -1) {
				iTab[op] = mkN(op, 'TRAPV', [4,1,0]);
				iTab[op].f = I_TRAPV;
				cnt++;
			} else {
				BUG.say('OP EXISTS TRAPV ' + op);
				return false;
			}
		}
		//TST	
		{
			var en = [M_rdd, M_rda, M_ria, M_ripo, M_ripr, M_rid, M_rii, M_absw, M_absl, M_imm];
			var z, z2, mr, ea;

			for (z = 0; z < 3; z++) {
				z2 = z == 0 ? 1 : (z == 1 ? 2 : 4);
				for (mr = 0; mr < 64; mr++) {
					ea = mkEA(mr, en, 0);
					if (ea[0] != -1) {
						op = (74 << 8) | (z << 6) | ea[0];

						if (iTab[op].op === -1) {
							iTab[op] = mkD(op, 'TST', z2, ea[1], ea[2], [4,1,0], ea[1] != M_rdd && ea[1] != M_rda);
							iTab[op].f = I_TST;
							cnt++;
						} else {
							BUG.say('OP EXISTS TST ' + op);
							return false;
						}
					}
				}
			}
		}
		//UNLK		
		{
			var An;

			for (An = 0; An < 8; An++) {
				op = (2507 << 3) | An;

				if (iTab[op].op === -1) {
					iTab[op] = mkS(op, 'UNLK', 0, M_rda, An, [12,3,0], false);
					iTab[op].f = I_UNLK;
					cnt++;
				} else {
					BUG.say('OP EXISTS UNLK ' + op);
					return false;
				}
			}
		}
		
		//for (op = 0; op < 0x10000; op++) if (iTab[op].op !== -1 && !(iTab[op].p.cyc || iTab[op].p.cycTaken || iTab[op].p.cycTrue || iTab[op].p.cycFalse || typeof(iTab[op].p.cyc) == 'number')) console.log(iTab[op].mn, iTab[op].p.z);
		
		BUG.say(sprintf('cpu.mkiTab() build %d instructions', cnt));
		return true;
	}
	/* ...end of the fun part. */

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	function printIdx(base, ar, pc) {
		var ext = AMIGA.mem.load16(pc);
		var disp = castByte(ext & 0xff);
		var r = (ext & 0x7000) >>> 12;
		var idx = (ext & 0x8000) ? regs.a[r] : regs.d[r];
		if (ext & 0x800) idx = castLong(idx);
		else idx = castWord(idx & 0xffff);
		var addr = (base + disp + idx);
		if (ar != -1)
			return sprintf('(%d,A%d,%s%d)[$%08x]', disp, ar, (ext & 0x8000) ? 'A' : 'D', r, addr);
		else
			return sprintf('(%d,PC,%s%d)[$%08x]', disp, (ext & 0x8000) ? 'A' : 'D', r, addr);
	}

	function printEA(ea, z, m, pc) {
		var dp, o = ' ';

		switch (ea.m) {
			case M_rdd:
				o += sprintf('D%d', ea.r);
				break;
			case M_rda:
				o += sprintf('A%d', ea.r);
				break;
			case M_ria:
				o += sprintf('(A%d)', ea.r);
				break;
			case M_ripo:
				o += sprintf('(A%d)+', ea.r);
				break;
			case M_ripr:
				o += sprintf('-(A%d)', ea.r);
				break;
			case M_rid:
				dp = castWord(AMIGA.mem.load16(pc)); pc += 2;
				o += sprintf('$%04x(A%d)[$%08x]', dp, ea.r, regs.a[ea.r] + dp);
				break;
			case M_rii:
				o += printIdx(regs.a[ea.r], ea.r, pc);
				break;
			case M_pcid:
				dp = castWord(AMIGA.mem.load16(pc));
				o += sprintf('$%04x(PC)[$%08x]', dp, pc + dp);
				pc += 2;
				break;
			case M_pcii:
				o += printIdx(pc, -1, pc); pc += 2;
				break;
			case M_absw:
				dp = castWord(AMIGA.mem.load16(pc)); pc += 2;
				o += sprintf('($%04x)', dp);
				break;
			case M_absl:
				dp = AMIGA.mem.load32(pc); pc += 4;
				o += sprintf('($%08x)', dp);
				break;
			case M_imm: {
				if (ea.r == -1) {
					switch (z) {
						case 1:
							dp = castByte(AMIGA.mem.load16(pc)); pc += 2;
							o += sprintf('#$%02x', dp & 0xff);
							break;
						case 2:
							dp = castWord(AMIGA.mem.load16(pc)); pc += 2;
							o += sprintf('#$%04x', dp);
							break;
						case 4:
							dp = castLong(AMIGA.mem.load32(pc)); pc += 4;
							o += sprintf('#$%08x', dp);
							break;
					}
				} else
					o += sprintf('#$%02x', castByte(ea.r));
				break;
			}
			case M_list:
				dp = AMIGA.mem.load16(pc); pc += 2;
				o += sprintf('#$%04x', dp) + ' ['+regsStr(dp, m == M_ripr)+']';
				break;
		}
		return [o, pc];
	}

	function printC(c, pc) {
		var o = ' ';

		if (c.dp != -1) {
			if (c.dp == 0) {
				var dp = castWord(AMIGA.mem.load16(pc));
				o += sprintf('$%08x', pc + dp);
				pc += 2;
			}
			/*else if (c.dp == 0xff) { //68020
				var dp = castLong(AMIGA.mem.load32(pc)); 
				o += sprintf('$%08x', pc + dp);
				pc += 4;
			}*/
			else {
				var dp = castByte(c.dp);
				o += sprintf('$%08x', pc + dp);
			}
		} else {
			var dp = castWord(AMIGA.mem.load16(pc));
			o += sprintf('D%d,$%08x', c.dr, pc + dp);
			pc += 2;
		}
		return [o, pc];
	}

	function printI(i, pc) {
		var o = i.mn;

		if (o == 'ILLEGAL') return [o, pc];

		if (i.p.z) o += '.' + szChr(i.p.z);
		o += ' ';
		if (i.p.s) {
			var ip = printEA(i.p.s, i.p.z, i.p.d ? i.p.d.m : 0, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.s && i.p.d) o += ',';
		if (i.p.d) {
			var ip = printEA(i.p.d, i.p.z, i.p.s ? i.p.s.m : 0, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.c) {
			var ip = printC(i.p.c, pc);
			o += ip[0];
			pc = ip[1];
		}
		return [o, pc];
	}

	this.diss = function (offset, limit) {
		var pc = offset === null ? regs.pc : offset;
		var cnt = 0;

		while (cnt++ < limit) {
			var o = '';

			o += sprintf('$%08x: ', pc);
			for (var i = 0; i < 5; i++)
				o += sprintf('$%04x ', AMIGA.mem.load16(pc + i * 2));

			var op = AMIGA.mem.load16(pc);
			pc += 2;

			var ip = printI(iTab[op], pc);
			o += ip[0];
			pc = ip[1];

			BUG.say(o);
		}
	};
	/*this.dissFault = function (limit) {
		this.diss(fault.pc, limit);
	};*/

	/*function nextIWordData(data, pc) {
		return (data[pc] << 8) | data[pc + 1];
	}
	function nextILongData(data, pc) {
		return (data[pc] << 24) | (data[pc + 1] << 16) | (data[pc + 2] << 8) | data[pc + 3];
	}
	function printIdxData(data, base, ar, pc) {
		var ext = nextIWordData(data, pc);
		var dp8 = castByte(ext & 0xff);
		var r = (ext & 0x7000) >>> 12;
		var idx = (ext & 0x8000) ? regs.a[r] : regs.d[r];
		if (ext & 0x800) idx = castLong(idx);
		else idx = castWord(idx & 0xffff);
		//dispreg <<= (dp >> 9) & 3; //68020
		var addr = (base + dp8 + idx);
		if (ar != -1)
			//return sprintf('(A%d,%s%d,%02x[$%08x][%s])', ar, (dp & 0x8000)?'A':'D', r, disp8, addr, (dp & 0x800)?'L':'W');
			return sprintf('(%d,A%d,%s%d)[$%08x]', dp8, ar, (ext & 0x8000) ? 'A' : 'D', r, addr);
		else
			//return sprintf('(PC($%08x),%s%d,%02x[$%08x][%s])', base, (dp & 0x8000)?'A':'D', r, disp8, addr, (dp & 0x800)?'L':'W');
			return sprintf('(%d,PC,%s%d)[$%08x]', dp8, (ext & 0x8000) ? 'A' : 'D', r, addr);
	}

	function printEAData(data, ea, z, pc) {
		var dp, o = ' ';

		switch (ea.m) {
			case M_rdd:
				o += sprintf('D%d', ea.r);
				break;
			case M_rda:
				o += sprintf('A%d', ea.r);
				break;
			case M_ria:
				o += sprintf('(A%d)', ea.r);
				break;
			case M_ripo:
				o += sprintf('(A%d)+', ea.r);
				break;
			case M_ripr:
				o += sprintf('-(A%d)', ea.r);
				break;
			case M_rid:
				dp = castWord(nextIWordData(data, pc)); pc += 2;
				o += sprintf('($%04x,A%d)[$%08x]', dp, ea.r, regs.a[ea.r] + dp);
				break;
			case M_rii:
				o += printIdxData(data, regs.a[ea.r], ea.r, pc);
				break;
			case M_pcid:
				dp = castWord(nextIWordData(data, pc)); pc += 2;
				o += sprintf('($%04x,PC)[$%08x]', dp, pc + dp);
				break;
			case M_pcii:
				o += printIdxData(data, pc, - 1, pc); pc += 2;
				break;
			case M_absw:
				dp = nextIWordData(data, pc); pc += 2;
				o += sprintf('($%04x).W', dp);
				break;
			case M_absl:
				dp = nextILongData(data, pc); pc += 4;
				o += sprintf('($%08x).L', dp);
				break;
			case M_imm: {
				if (ea.r == -1) {
					switch (z) {
						case 1:
							dp = castByte(nextIWordData(data, pc)); pc += 2;
							o += sprintf('#&lt;$%02x&gt;', dp & 0xff);
							break;
						case 2:
							dp = castWord(nextIWordData(data, pc)); pc += 2;
							o += sprintf('#&lt;$%04x&gt;', dp);
							break;
						case 4:
							dp = castLong(nextILongData(data, pc)); pc += 4;
							o += sprintf('#&lt;$%08x&gt;', dp);
							break;
					}
				} else
					o += sprintf('#&lt;$%02x&gt;', castByte(ea.r));
				break;
			}
			case M_list:
				dp = nextIWordData(data, pc); pc += 2;
				o += sprintf('[$%04x]', dp);
				break;
		}
		return [o, pc];
	}

	function printCData(data, c, pc) {
		var o = ' ';

		if (c.dp != -1) {
			if (c.dp == 0) {
				var dp = castWord(nextIWordData(data, pc));
				o += sprintf('$%08x', pc + dp);
				pc += 2;
			}
			else {
				var dp = castByte(c.dp);
				o += sprintf('$%08x', pc + dp);
			}
		} else {
			var dp = castWord(nextIWordData(data, pc));
			o += sprintf('D%d,$%08x', c.dr, pc + dp);
			pc += 2;
		}
		return [o, pc];
	}

	function printIData(data, i, pc) {
		var o = i.mn;

		if (o == 'ILLEGAL') return [o, pc];

		if (i.p.z) o += '.' + szChr(i.p.z);
		o += ' ';
		if (i.p.s) {
			var ip = printEAData(data, i.p.s, i.p.z, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.s && i.p.d) o += ',';
		if (i.p.d) {
			var ip = printEAData(data, i.p.d, i.p.z, pc);
			o += ip[0];
			pc = ip[1];
		}
		if (i.p.c) {
			var ip = printCData(data, i.p.c, pc);
			o += ip[0];
			pc = ip[1];
		}
		return [o, pc];
	}
	this.dissData = function (data, limit) {
		var pc = 0;
		var cnt = 0;

		while (cnt++ < limit) {
			var o = '';

			o += sprintf('$%08x: ', pc);
			for (var i = 0; i < 5; i++)
				o += sprintf('$%04x ', nextIWordData(data, pc+i*2));

			var op = nextIWordData(data, pc);
			pc += 2;

			var ip = printIData(data, iTab[op], pc);
			o += ip[0];
			pc = ip[1];

			BUG.say(o);
		}
	}*/

	function getName(addr)
	{
		var c, p = 0, n = '';
		while ((c = AMIGA.mem.load8(addr + p))) {
			n += String.fromCharCode(c);
			if (p++ > 100) return '';
		}
		return n;
	}

	function getTaskName(task) {
		return getName(AMIGA.mem.load32(task + 10));
	}
	
	this.getThisTaskName = function () {
		var tn = '';
		/* Extract current task-name form SysBase */
		var sysBase = AMIGA.mem.load32(4);
		if (sysBase == 0x000676 || sysBase == 0xc00276 || sysBase == 0xc00a88 || sysBase == 0xc00560) {
			var thisTask = AMIGA.mem.load32(sysBase + 276);
			if (thisTask)
				tn = getTaskName(thisTask);
		}
		return tn;
	};
	
	this.dump = function () {
		var i, out = '', tn = 1 ? this.getThisTaskName() : '';

		for (i = 0; i < 8; i++) {
			out += sprintf('D%d $%08x ', i, regs.d[i]); //if ((i & 3) == 3) out += '<br/>';
		}
		//out += '<br/>';
		out += "\n";
		for (i = 0; i < 8; i++) {
			out += sprintf('A%d $%08x ', i, regs.a[i]); //if ((i & 3) == 3) out += '<br/>';
		}
		//out += '<br/>';
		out += "\n";
		out += sprintf('PC $%08x USP $%08x ISP $%08x ', regs.pc, regs.usp, regs.isp);
		out += sprintf('T=%d S=%d X=%d N=%d Z=%d V=%d C=%d IMASK=%d, LTASK=%s', regs.t ? 1 : 0, regs.s ? 1 : 0, regs.x ? 1 : 0, regs.n ? 1 : 0, regs.z ? 1 : 0, regs.v ? 1 : 0, regs.c ? 1 : 0, regs.intmask, tn);
		out += "\n";
		out += "\n";
		BUG.say(out);
	};

	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/
	/*-----------------------------------------------------------------------*/

	/*function superState()
	{
		if (!regs.s) {
			regs.s = true; 
			//regs.t = false; 
			var temp = regs.usp;
			regs.usp = regs.a[7];
			regs.a[7] = temp;
			BUG.col = 2;
		}
	}

	function userState(s)
	{
		if (s) {
			var temp = regs.usp;
			regs.usp = regs.a[7];
			regs.a[7] = temp;
			BUG.col = 1;
		}
	}*/

	function getCCR() {
		return (((regs.x ? 1 : 0) << 4) | ((regs.n ? 1 : 0) << 3) | ((regs.z ? 1 : 0) << 2) | ((regs.v ? 1 : 0) << 1) | (regs.c ? 1 : 0));
	}

	function setCCR(ccr) {
		regs.x = ((ccr >> 4) & 1) == 1;
		regs.n = ((ccr >> 3) & 1) == 1;
		regs.z = ((ccr >> 2) & 1) == 1;
		regs.v = ((ccr >> 1) & 1) == 1;
		regs.c = (ccr & 1) == 1;
	}

	function getSR() {
		return (((regs.t ? 1 : 0) << 15) | ((regs.s ? 1 : 0) << 13) | (regs.intmask << 8) | ((regs.x ? 1 : 0) << 4) | ((regs.n ? 1 : 0) << 3) | ((regs.z ? 1 : 0) << 2) | ((regs.v ? 1 : 0) << 1) | (regs.c ? 1 : 0));
	}

	function setSR(sr) {
		regs.x = ((sr >> 4) & 1) == 1;
		regs.n = ((sr >> 3) & 1) == 1;
		regs.z = ((sr >> 2) & 1) == 1;
		regs.v = ((sr >> 1) & 1) == 1;
		regs.c = (sr & 1) == 1;

		var t = ((sr >> 15) & 1) == 1;
		var s = ((sr >> 13) & 1) == 1;
		var intmask = ((sr >> 8) & 7);

		if (regs.t == t && regs.s == s && regs.intmask == intmask) {
			//BUG.say('cpu.setSR() mode ok!');
			return;
		}
		    
		var olds = regs.s;
		regs.t = t;
		regs.s = s;
		regs.intmask = intmask;

		if (regs.s != olds) {
			//BUG.say(sprintf('cpu.setSR() mode switch %s', olds ? 'userstate' : 'superstate'));
			//userState(olds); 

			if (olds) {
				regs.isp = regs.a[7];
				regs.a[7] = regs.usp;

				BUG.col = 1;
			} else {
				BUG.say('cpu.setSR() mode switch to superstate!');

				regs.usp = regs.a[7];
				regs.a[7] = regs.isp;

				BUG.col = 2;
			}
		} 

		AMIGA.doint();
		//if (regs.t1 || regs.t0)
		if (regs.t)
			set_special(SPCFLAG_TRACE);
		else
			/* Keep SPCFLAG_DOTRACE, we still want a trace exception for SR-modifying instructions (including STOP).  */
			clr_special(SPCFLAG_TRACE);				
	}

	function setPC(pc) {
		if (pc & 1) {
			BUG.say(sprintf('cpu.setPC() ADDRESS ERROR pc $%08x', pc));
			AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			exception3(pc, 0);
		}
		else if (pc > 0xffffff) {
			BUG.say(sprintf('cpu.setPC() BUS ERROR, $%08x > 24bit, reducing address to $%08x', pc, pc & 0xffffff));
			AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			//exception2(pc, 0);
			pc &= 0xffffff;
		}
		else if (pc < 4) {
			BUG.say(sprintf('cpu.setPC() BUS ERROR pc $%08x', pc));
			AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			//exception2(pc, 0);
			//AMIGA.state = 0;
		}
		regs.pc = pc;
	}
	
	function exception_trace(n) {
		clr_special(SPCFLAG_TRACE | SPCFLAG_DOTRACE);
		//if (regs.t1 && !regs.t0) {
		if (regs.t) {
			/* trace stays pending if exception is div by zero, chk, trapv or trap #x */
			if (n == 5 || n == 6 || n == 7 || (n >= 32 && n <= 47))
				set_special(SPCFLAG_DOTRACE);
		}
		//regs.t1 = regs.t0 = regs.m = 0;
		regs.t = 0;
	}
	
	/*function exception_cycles(n) {
		var c;
		if (n < 16)
			switch (n) {
				case  0: c = [40,6,0]; break; //Reset Initial Interrupt Stack Pointer             
				case  1: c = [40,6,0]; break; //Reset Initial Program Counter                     
				case  2: c = [50,4,7]; break; //Access Fault                                      
				case  3: c = [50,4,7]; break; //Address Error                                     
				case  4: c = [34,4,3]; break; //Illegal Instruction                               
				case  5: c = [42,5,3]; break; //Integer Divide by Zero                            
				case  6: c = [44,5,3]; break; //CHK, CHK2 Instruction                             
				case  7: c = [34,4,3]; break; //FTRAPcc, TRAPcc, TRAPV Instructions               
				case  8: c = [34,4,3]; break; //Privilege Violation                               
				case  9: c = [34,4,3]; break; //Trace                                             
				case 10: c = [34,4,3]; break; //Line 1010 Emulator (Unimplemented A- Line Opcode) 
				case 11: c = [34,4,3]; break; //Line 1111 Emulator (Unimplemented F-Line Opcode)			
			}		
		else if (n >= 24 && n < 32)
			c = [44+4,5,3];
		else if (n >= 32 && n < 48)
			c = [38,4,3]; 
		else {
			BUG.say(sprintf('cpu.exception() no cycle for %d', n));
			c = [4,0,0];
		}
		return c;
	}*/

	function exception(n) {
		//BUG.say(sprintf('cpu.exception() nr %d', n));
		var olds = regs.s;

		if (n >= 24 && n < 24 + 8) {
			var oldn = n;
			n = AMIGA.mem.load8(0x00fffff1 | (n << 1));
			if (n != oldn) BUG.say(sprintf('cpu.exception() exception from %d to %d', oldn, n));
		}

		var sr = getSR();
		//superState();		
		if (!regs.s) {
			regs.s = true;
			regs.usp = regs.a[7];
			regs.a[7] = regs.isp;
			
			BUG.col = 2;
		}
 
		if (n == 2) {
			BUG.say(sprintf('cpu.exception() %d, regs.pc $%08x, fault.pc $%08x, fault.op $%04x, fault.ad $%08x, fault.ia %d', n, regs.pc, fault.pc, fault.op, fault.ad, fault.ia ? 1 : 0));

			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, sr);
		} else if (n == 3) {
			BUG.say(sprintf('cpu.exception() %d, regs.pc $%08x, fault.pc $%08x, fault.op $%04x, fault.ad $%08x, fault.ia %d', n, regs.pc, fault.pc, fault.op, fault.ad, fault.ia ? 1 : 0));

			var ia = fault.ia;
			var wa = 0;
			var cd = (wa ? 0 : 16) | (olds ? 4 : 0) | (ia ? 2 : 1);

			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, fault.pc);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, sr);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, fault.op);
			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, fault.ad);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, cd);							
		} else {
			stEA(exEA(new EffAddr(M_ripr, 7), 4), 4, regs.pc);
			stEA(exEA(new EffAddr(M_ripr, 7), 2), 2, sr);
		}
		
		var pc = AMIGA.mem.load32(n * 4);
		if (pc & 1) {
			BUG.say(sprintf('cpu.exception() ADDRESS ERROR pc $%08x', pc));
			if (n == 2 || n == 3) {
				AMIGA.reset();
				throw new Error('double address/bus-error'); 
			} else
				exception3(pc, 0);
		}
		/*else if (pc > 0xffffff) {
			BUG.say(sprintf('cpu.exception() BUS ERROR pc $%08x', pc));
			//AMIGA.cpu.diss(fault.pc, 1);
			//AMIGA.cpu.dump();  
			exception2(pc, 0);		
		}*/
		regs.pc = pc;
		
		exception_trace(n);
		return [4,0,0];//exception_cycles(n);
	}

	/*function exception2(ad) {
		fault.ad = ad;
		fault.ia = 0;
		throw new Exception23(2);
	}*/
	
	function exception3(ad, ia) {
		fault.ad = ad;
		fault.ia = ia;
		throw new Exception23(3);
	}
	
	function interrupt(nr) {
		regs.stopped = false;
		clr_special(SPCFLAG_STOP);
		//assert(nr < 8 && nr >= 0);

		exception(nr + 24);

		regs.intmask = nr;
		AMIGA.doint();
	}	

	function cycle_spc(cycles) {
		if (AMIGA.spcflags & SPCFLAG_COPPER)
			AMIGA.copper.cycle();

		while ((AMIGA.spcflags & SPCFLAG_BLTNASTY) && AMIGA.dmaen(DMAF_BLTEN) && cycles > 0) {
			var c = AMIGA.blitter.blitnasty();
			//console.log('nasty', cycles, c);
			if (c > 0) {
				cycles -= c * CYCLE_UNIT * 2;
				if (cycles < CYCLE_UNIT)
					cycles = 0;
			} else
				c = 4;

			AMIGA.events.cycle(c * CYCLE_UNIT);
			if (AMIGA.spcflags & SPCFLAG_COPPER)
				AMIGA.copper.cycle();
		}

		if (AMIGA.spcflags & SPCFLAG_DOTRACE)
			exception(9);
			
		if (AMIGA.spcflags & SPCFLAG_TRAP) {
			clr_special(SPCFLAG_TRAP);
			exception(3);
		}

		while (AMIGA.spcflags & SPCFLAG_STOP) {
			AMIGA.events.cycle(4 * CYCLE_UNIT);
			
			if (AMIGA.spcflags & SPCFLAG_COPPER)
				AMIGA.copper.cycle();

			if (AMIGA.spcflags & (SPCFLAG_INT | SPCFLAG_DOINT)) {
				clr_special(SPCFLAG_INT | SPCFLAG_DOINT);
				var intr = AMIGA.intlev();
				if (intr > 0 && intr > regs.intmask)
					interrupt(intr);
			}
			//if (AMIGA.spcflags & SPCFLAG_BRK) {
			if (AMIGA.state != ST_CYCLE) {		
				//clr_special(SPCFLAG_BRK);
				clr_special(SPCFLAG_STOP);
				regs.stopped = false;
				return true;
			}		
		}

		if (AMIGA.spcflags & SPCFLAG_TRACE) {
			if (regs.t) {
				clr_special(SPCFLAG_TRACE);
				set_special(SPCFLAG_DOTRACE);
			}
		}

		if (AMIGA.spcflags & SPCFLAG_INT) {
			clr_special(SPCFLAG_INT | SPCFLAG_DOINT);
			var intr = AMIGA.intlev();
			if (intr > 0 && intr > regs.intmask)
				interrupt(intr);
		}
		if (AMIGA.spcflags & SPCFLAG_DOINT) {
			clr_special(SPCFLAG_DOINT);
			set_special(SPCFLAG_INT);
		}
		/*if (AMIGA.spcflags & SPCFLAG_BRK) {
			clr_special(SPCFLAG_BRK);
			return true;
		}*/		
		return false;		
	}	
	
	this.cycle = function() {
		while (AMIGA.state == ST_CYCLE) {		
			AMIGA.events.cycle(cpu_cycles);

			var op = nextOPCode();	
			try {
				var cycles = iTab[op].f(iTab[op].p);
				cpu_cycles = cycles[0] * cpu_cycle_unit;	
			} catch (e) {
				if (e instanceof Exception23) {
					//BUG.info('cpu.cycle_real() USER EXCEPTION [%d]', e.num);
					var cycles = exception(e.num);
					cpu_cycles = cycles[0] * cpu_cycle_unit;	
				}
				else if (e instanceof VSync) { 
					//BUG.info('cpu.cycle_real() VSYNC [%s]', e);
					cpu_cycles = 48 * cpu_cycle_unit;	
					throw new VSync(e.error, e.message);
				} 
				else if (e instanceof FatalError) { 
					//BUG.info('cpu.cycle_real() FATAL ERROR [%s]', e);
					Fatal(e.error, e.message);
				} 
				else {  				
					Fatal(SAEE_CPU_Internal, e.message);
				}
			}
			
			if (AMIGA.spcflags)
				cycle_spc(cpu_cycles);
		}
	}	
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Custom() {
	this.last_value = 0;

	this.setup = function () {
	};
	this.reset = function () {
	};

	/*---------------------------------*/
	
	this.load16_real = function (hpos, addr, noput) {
		var writeonly = false;
		var v;

		addr &= 0xfff;

		switch (addr & 0x1fe) {
			case 0x002:
				v = AMIGA.DMACONR(hpos);
				break;
			case 0x004:
				v = AMIGA.playfield.VPOSR();
				break;
			case 0x006:
				v = AMIGA.playfield.VHPOSR();
				break;

			case 0x00A:
				v = AMIGA.input.JOY0DAT();
				break;
			case 0x00C:
				v = AMIGA.input.JOY1DAT();
				break;
			case 0x00E:
				v = AMIGA.playfield.CLXDAT();
				break;
			case 0x010:
				v = AMIGA.ADKCONR();
				break;

			case 0x012:
				v = AMIGA.input.POT0DAT();
				break;
			case 0x014:
				v = AMIGA.input.POT1DAT();
				break;
			case 0x016:
				v = AMIGA.input.POTGOR();
				break;
			case 0x018:
				v = AMIGA.serial.SERDATR();
				break;
			case 0x01A:
				v = AMIGA.disk.DSKBYTR(hpos);
				break;
			case 0x01C:
				v = AMIGA.INTENAR();
				break;
			case 0x01E:
				v = AMIGA.INTREQR();
				break;
			case 0x07C:
			{
				var result = AMIGA.playfield.DENISEID();
				if (result[0])
					writeonly = true;
				else
					v = result[1];
				break;
			}

			/*#ifdef AGA
			 case 0x180: case 0x182: case 0x184: case 0x186: case 0x188: case 0x18A:
			 case 0x18C: case 0x18E: case 0x190: case 0x192: case 0x194: case 0x196:
			 case 0x198: case 0x19A: case 0x19C: case 0x19E: case 0x1A0: case 0x1A2:
			 case 0x1A4: case 0x1A6: case 0x1A8: case 0x1AA: case 0x1AC: case 0x1AE:
			 case 0x1B0: case 0x1B2: case 0x1B4: case 0x1B6: case 0x1B8: case 0x1BA:
			 case 0x1BC: case 0x1BE:
			 if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			 writeonly = true;
			 v = COLOR_READ ((addr & 0x3E) >> 1);
			 break;
			 #endif*/

			default:
				writeonly = true;
		}

		if (writeonly) {
			v = this.last_value;
			if (!noput) {
				var l = 0xffff; //AMIGA.config.cpu.compatible && AMIGA.config.cpu.model == 68000 ? regs.irc : 0xffff;
				AMIGA.playfield.decide_line(hpos);
				AMIGA.playfield.decide_fetch(hpos);

				var r = this.store16_real(hpos, addr, l, 1);
				if (r) { /* register don't exist */
					if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
						v = l;
					} else {
						if ((addr & 0x1fe) == 0) {
							/*if (is_cycle_ce())
							 v = this.last_value;
							 else*/
							v = l;
						}
					}
				} else {
					if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)
						v = 0xffff;
					else
						v = l;
				}
				//BUG.info('Custom.load16_real() %08x read = %04x. value written = %04x', 0xdff000 | addr, v, l);
				return v;
			}
		}

		this.last_value = v;
		return v;
	};

	this.load16_2 = function (addr) {
		var hpos = AMIGA.playfield.hpos();

		AMIGA.copper.sync_copper_with_cpu(hpos, 1);
		return this.load16_real(hpos, addr, 0);
	};

	this.load16 = function (addr) {
		if (addr & 1) {
			addr &= ~1;
			return (this.load16_2(addr) << 8) | (this.load16_2(addr + 2) >> 8);
		}
		return this.load16_2(addr);
	};

	this.load8 = function (addr) {
		return this.load16_2(addr & ~1) >> ((addr & 1) ? 0 : 8);
	};

	this.load32 = function (addr) {
		return ((this.load16(addr) << 16) | this.load16(addr + 2)) >>> 0;
	};
	
	/*---------------------------------*/
	
	this.store16_real = function (hpos, addr, value, noget) {
		if (!noget) this.last_value = value;

		addr &= 0x1fe;
		value &= 0xffff;

		switch (addr) {
			case 0x00E:
				AMIGA.playfield.CLXDAT();
				break;

			case 0x020:
				AMIGA.disk.DSKPTH(value);
				break;
			case 0x022:
				AMIGA.disk.DSKPTL(value);
				break;
			case 0x024:
				AMIGA.disk.DSKLEN(value, hpos);
				break;
			case 0x026: /* AMIGA.disk.DSKDAT(value). Writing to DMA write registers won't do anything */
				break;

			case 0x02A:
				AMIGA.playfield.VPOSW(value);
				break;
			case 0x02C:
				AMIGA.playfield.VHPOSW(value);
				break;
			case 0x02E:
				AMIGA.copper.COPCON(value);
				break;
			case 0x030:
				AMIGA.serial.SERDAT(value);
				break;
			case 0x032:
				AMIGA.serial.SERPER(value);
				break;
			case 0x034:
				AMIGA.input.POTGO(value);
				break;

			case 0x040:
				AMIGA.blitter.BLTCON0(hpos, value);
				break;
			case 0x042:
				AMIGA.blitter.BLTCON1(hpos, value);
				break;

			case 0x044:
				AMIGA.blitter.BLTAFWM(hpos, value);
				break;
			case 0x046:
				AMIGA.blitter.BLTALWM(hpos, value);
				break;

			case 0x050:
				AMIGA.blitter.BLTAPTH(hpos, value);
				break;
			case 0x052:
				AMIGA.blitter.BLTAPTL(hpos, value);
				break;
			case 0x04C:
				AMIGA.blitter.BLTBPTH(hpos, value);
				break;
			case 0x04E:
				AMIGA.blitter.BLTBPTL(hpos, value);
				break;
			case 0x048:
				AMIGA.blitter.BLTCPTH(hpos, value);
				break;
			case 0x04A:
				AMIGA.blitter.BLTCPTL(hpos, value);
				break;
			case 0x054:
				AMIGA.blitter.BLTDPTH(hpos, value);
				break;
			case 0x056:
				AMIGA.blitter.BLTDPTL(hpos, value);
				break;

			case 0x058:
				AMIGA.blitter.BLTSIZE(hpos, value);
				break;

			case 0x064:
				AMIGA.blitter.BLTAMOD(hpos, value);
				break;
			case 0x062:
				AMIGA.blitter.BLTBMOD(hpos, value);
				break;
			case 0x060:
				AMIGA.blitter.BLTCMOD(hpos, value);
				break;
			case 0x066:
				AMIGA.blitter.BLTDMOD(hpos, value);
				break;

			case 0x070:
				AMIGA.blitter.BLTCDAT(hpos, value);
				break;
			case 0x072:
				AMIGA.blitter.BLTBDAT(hpos, value);
				break;
			case 0x074:
				AMIGA.blitter.BLTADAT(hpos, value);
				break;

			case 0x07E:
				AMIGA.disk.DSKSYNC(value, hpos);
				break;

			case 0x080:
				AMIGA.copper.COP1LCH(value);
				break;
			case 0x082:
				AMIGA.copper.COP1LCL(value);
				break;
			case 0x084:
				AMIGA.copper.COP2LCH(value);
				break;
			case 0x086:
				AMIGA.copper.COP2LCL(value);
				break;

			case 0x088:
				AMIGA.copper.COPJMP(1, 0);
				break;
			case 0x08A:
				AMIGA.copper.COPJMP(2, 0);
				break;

			case 0x08E:
				AMIGA.playfield.DIWSTRT(hpos, value);
				break;
			case 0x090:
				AMIGA.playfield.DIWSTOP(hpos, value);
				break;
			case 0x092:
				AMIGA.playfield.DDFSTRT(hpos, value);
				break;
			case 0x094:
				AMIGA.playfield.DDFSTOP(hpos, value);
				break;

			case 0x096:
				AMIGA.DMACON(value, hpos);
				break;
			case 0x098:
				AMIGA.playfield.CLXCON(value);
				break;
			case 0x09A:
				AMIGA.INTENA(value);
				break;
			case 0x09C:
				AMIGA.INTREQ(value);
				break;
			case 0x09E:
				AMIGA.ADKCON(value, hpos);
				break;

			case 0x0A0:
				AMIGA.audio.AUDxLCH(0, value);
				break;
			case 0x0A2:
				AMIGA.audio.AUDxLCL(0, value);
				break;
			case 0x0A4:
				AMIGA.audio.AUDxLEN(0, value);
				break;
			case 0x0A6:
				AMIGA.audio.AUDxPER(0, value);
				break;
			case 0x0A8:
				AMIGA.audio.AUDxVOL(0, value);
				break;
			case 0x0AA:
				AMIGA.audio.AUDxDAT(0, value);
				break;

			case 0x0B0:
				AMIGA.audio.AUDxLCH(1, value);
				break;
			case 0x0B2:
				AMIGA.audio.AUDxLCL(1, value);
				break;
			case 0x0B4:
				AMIGA.audio.AUDxLEN(1, value);
				break;
			case 0x0B6:
				AMIGA.audio.AUDxPER(1, value);
				break;
			case 0x0B8:
				AMIGA.audio.AUDxVOL(1, value);
				break;
			case 0x0BA:
				AMIGA.audio.AUDxDAT(1, value);
				break;

			case 0x0C0:
				AMIGA.audio.AUDxLCH(2, value);
				break;
			case 0x0C2:
				AMIGA.audio.AUDxLCL(2, value);
				break;
			case 0x0C4:
				AMIGA.audio.AUDxLEN(2, value);
				break;
			case 0x0C6:
				AMIGA.audio.AUDxPER(2, value);
				break;
			case 0x0C8:
				AMIGA.audio.AUDxVOL(2, value);
				break;
			case 0x0CA:
				AMIGA.audio.AUDxDAT(2, value);
				break;

			case 0x0D0:
				AMIGA.audio.AUDxLCH(3, value);
				break;
			case 0x0D2:
				AMIGA.audio.AUDxLCL(3, value);
				break;
			case 0x0D4:
				AMIGA.audio.AUDxLEN(3, value);
				break;
			case 0x0D6:
				AMIGA.audio.AUDxPER(3, value);
				break;
			case 0x0D8:
				AMIGA.audio.AUDxVOL(3, value);
				break;
			case 0x0DA:
				AMIGA.audio.AUDxDAT(3, value);
				break;

			case 0x0E0:
				AMIGA.playfield.BPLxPTH(hpos, value, 0);
				break;
			case 0x0E2:
				AMIGA.playfield.BPLxPTL(hpos, value, 0);
				break;
			case 0x0E4:
				AMIGA.playfield.BPLxPTH(hpos, value, 1);
				break;
			case 0x0E6:
				AMIGA.playfield.BPLxPTL(hpos, value, 1);
				break;
			case 0x0E8:
				AMIGA.playfield.BPLxPTH(hpos, value, 2);
				break;
			case 0x0EA:
				AMIGA.playfield.BPLxPTL(hpos, value, 2);
				break;
			case 0x0EC:
				AMIGA.playfield.BPLxPTH(hpos, value, 3);
				break;
			case 0x0EE:
				AMIGA.playfield.BPLxPTL(hpos, value, 3);
				break;
			case 0x0F0:
				AMIGA.playfield.BPLxPTH(hpos, value, 4);
				break;
			case 0x0F2:
				AMIGA.playfield.BPLxPTL(hpos, value, 4);
				break;
			case 0x0F4:
				AMIGA.playfield.BPLxPTH(hpos, value, 5);
				break;
			case 0x0F6:
				AMIGA.playfield.BPLxPTL(hpos, value, 5);
				break;
			case 0x0F8:
				AMIGA.playfield.BPLxPTH(hpos, value, 6);
				break;
			case 0x0FA:
				AMIGA.playfield.BPLxPTL(hpos, value, 6);
				break;
			case 0x0FC:
				AMIGA.playfield.BPLxPTH(hpos, value, 7);
				break;
			case 0x0FE:
				AMIGA.playfield.BPLxPTL(hpos, value, 7);
				break;

			case 0x100:
				AMIGA.playfield.BPLCON0(hpos, value);
				break;
			case 0x102:
				AMIGA.playfield.BPLCON1(hpos, value);
				break;
			case 0x104:
				AMIGA.playfield.BPLCON2(hpos, value);
				break;
			case 0x106:
				AMIGA.playfield.BPLCON3(hpos, value);
				break;

			case 0x108:
				AMIGA.playfield.BPL1MOD(hpos, value);
				break;
			case 0x10A:
				AMIGA.playfield.BPL2MOD(hpos, value);
				break;
			//case 0x10E: AMIGA.playfield.CLXCON2(value); break; //AGA

			case 0x110:
				AMIGA.playfield.BPLxDAT(hpos, value, 0);
				break;
			case 0x112:
				AMIGA.playfield.BPLxDAT(hpos, value, 1);
				break;
			case 0x114:
				AMIGA.playfield.BPLxDAT(hpos, value, 2);
				break;
			case 0x116:
				AMIGA.playfield.BPLxDAT(hpos, value, 3);
				break;
			case 0x118:
				AMIGA.playfield.BPLxDAT(hpos, value, 4);
				break;
			case 0x11A:
				AMIGA.playfield.BPLxDAT(hpos, value, 5);
				break;
			case 0x11C:
				AMIGA.playfield.BPLxDAT(hpos, value, 6);
				break;
			case 0x11E:
				AMIGA.playfield.BPLxDAT(hpos, value, 7);
				break;

			case 0x180:
			case 0x182:
			case 0x184:
			case 0x186:
			case 0x188:
			case 0x18A:
			case 0x18C:
			case 0x18E:
			case 0x190:
			case 0x192:
			case 0x194:
			case 0x196:
			case 0x198:
			case 0x19A:
			case 0x19C:
			case 0x19E:
			case 0x1A0:
			case 0x1A2:
			case 0x1A4:
			case 0x1A6:
			case 0x1A8:
			case 0x1AA:
			case 0x1AC:
			case 0x1AE:
			case 0x1B0:
			case 0x1B2:
			case 0x1B4:
			case 0x1B6:
			case 0x1B8:
			case 0x1BA:
			case 0x1BC:
			case 0x1BE:
				AMIGA.playfield.COLOR_WRITE(hpos, value & 0xFFF, (addr & 0x3E) >> 1);
				break;

			case 0x120:
			case 0x124:
			case 0x128:
			case 0x12C:
			case 0x130:
			case 0x134:
			case 0x138:
			case 0x13C:
				AMIGA.playfield.SPRxPTH(hpos, value, (addr - 0x120) >> 2);
				break;
			case 0x122:
			case 0x126:
			case 0x12A:
			case 0x12E:
			case 0x132:
			case 0x136:
			case 0x13A:
			case 0x13E:
				AMIGA.playfield.SPRxPTL(hpos, value, (addr - 0x122) >> 2);
				break;
			case 0x140:
			case 0x148:
			case 0x150:
			case 0x158:
			case 0x160:
			case 0x168:
			case 0x170:
			case 0x178:
				AMIGA.playfield.SPRxPOS(hpos, value, (addr - 0x140) >> 3);
				break;
			case 0x142:
			case 0x14A:
			case 0x152:
			case 0x15A:
			case 0x162:
			case 0x16A:
			case 0x172:
			case 0x17A:
				AMIGA.playfield.SPRxCTL(hpos, value, (addr - 0x142) >> 3);
				break;
			case 0x144:
			case 0x14C:
			case 0x154:
			case 0x15C:
			case 0x164:
			case 0x16C:
			case 0x174:
			case 0x17C:
				AMIGA.playfield.SPRxDATA(hpos, value, (addr - 0x144) >> 3);
				break;
			case 0x146:
			case 0x14E:
			case 0x156:
			case 0x15E:
			case 0x166:
			case 0x16E:
			case 0x176:
			case 0x17E:
				AMIGA.playfield.SPRxDATB(hpos, value, (addr - 0x146) >> 3);
				break;

			case 0x36:
				AMIGA.input.JOYTEST(value);
				break;
			case 0x5A:
				AMIGA.blitter.BLTCON0L(hpos, value);
				break;
			case 0x5C:
				AMIGA.blitter.BLTSIZV(hpos, value);
				break;
			case 0x5E:
				AMIGA.blitter.BLTSIZH(hpos, value);
				break;
			case 0x1E4:
				AMIGA.playfield.DIWHIGH(hpos, value);
				break;
			//case 0x10C: AMIGA.playfield.BPLCON4(hpos, value); break; //AGA

			case 0x1DC:
				AMIGA.playfield.BEAMCON0(value);
				break;
			case 0x1C0:
				if (AMIGA.playfield.htotal != value) {
					AMIGA.playfield.htotal = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1C2:
				if (AMIGA.playfield.hsstop != value) {
					AMIGA.playfield.hsstop = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1C4:
				if (AMIGA.playfield.hbstrt != value) {
					AMIGA.playfield.hbstrt = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1C6:
				if (AMIGA.playfield.hbstop != value) {
					AMIGA.playfield.hbstop = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1C8:
				if (AMIGA.playfield.vtotal != value) {
					AMIGA.playfield.vtotal = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1CA:
				if (AMIGA.playfield.vsstop != value) {
					AMIGA.playfield.vsstop = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1CC:
				if (AMIGA.playfield.vbstrt < value || AMIGA.playfield.vbstrt > value + 1) {
					AMIGA.playfield.vbstrt = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1CE:
				if (AMIGA.playfield.vbstop < value || AMIGA.playfield.vbstop > value + 1) {
					AMIGA.playfield.vbstop = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1DE:
				if (AMIGA.playfield.hsstrt != value) {
					AMIGA.playfield.hsstrt = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1E0:
				if (AMIGA.playfield.vsstrt != value) {
					AMIGA.playfield.vsstrt = value;
					AMIGA.playfield.varsync();
				}
				break;
			case 0x1E2:
				if (AMIGA.playfield.hcenter != value) {
					AMIGA.playfield.hcenter = value;
					AMIGA.playfield.varsync();
				}
				break;

			//case 0x1FC: AMIGA.playfield.FMODE(hpos, value); break; //AGA
			//case 0x1FE: FNULL (value); break;
			case 0x1FE:
				break;

			/* writing to read-only register causes read access */
			default:
			{
				if (!noget) {
					//BUG.info('Custom.store16_real() %04x written', addr);
					this.load16_real(hpos, addr, 1);
				}
				return true;
			}
		}
		return false;
	};

	this.store16 = function (addr, value) {
		var hpos = AMIGA.playfield.hpos();
		AMIGA.copper.sync_copper_with_cpu(hpos, 1);
		if (addr & 1) {
			addr &= ~1;
			this.store16_real(hpos, addr, (value >> 8) | (value & 0xff00), 0);
			this.store16_real(hpos, addr + 2, (value << 8) | (value & 0x00ff), 0);
			return;
		}
		this.store16_real(hpos, addr, value, 0);
	};

	this.store8 = function (addr, value) {
		var rval;

		/*if (AMIGA.config.chipset.mask & CSMASK_AGA) {
		 if (addr & 1) {
		 rval = value & 0xff;
		 } else {
		 rval = (value << 8) | (value & 0xFF);
		 }
		 } else*/
		rval = (value << 8) | (value & 0xff);

		/*if (AMIGA.config.cpu.model == 68060) {
		 if (addr & 1)
		 this.store16(addr & ~1, rval);
		 else
		 this.store16(addr, value << 8);
		 } else*/
		this.store16(addr & ~1, rval);
	};

	this.store32 = function (addr, value) {
		this.store16(addr & 0xfffe, value >>> 16);
		this.store16((addr + 2) & 0xfffe, value & 0xffff);
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
* Notes: Ported from WinUAE 2.5.0
* 
**************************************************************************/

const LONGWRITEMODE = 0;
 
const FLOPPY_DRIVE_HD = 1;
const FLOPPY_WRITE_MAXLEN = 0x3800;

const DDHDMULT = FLOPPY_DRIVE_HD ? 2 : 1;

const MAX_FLOPPY_DRIVES = 4;
const MAX_SECTORS = DDHDMULT * 11;
const MAX_TRACKS = 2 * 83;

const MIN_STEPLIMIT_CYCLE = CYCLE_UNIT * 250;

const DISK_INDEXSYNC = 1;
const DISK_WORDSYNC = 2;
const DISK_REVOLUTION = 4; /* 8,16,32,64 */

const DSKREADY_UP_TIME = 20;
const DSKREADY_DOWN_TIME = 50;
const WORDSYNC_TIME = 11;

const DSKDMA_OFF = 0;
const DSKDMA_READ = 1;
const DSKDMA_WRITE = 2;

const DRIVE_ID_NONE  = 0x00000000;
const DRIVE_ID_35DD  = 0xFFFFFFFF;
const DRIVE_ID_35HD  = 0xAAAAAAAA;
const DRIVE_ID_525SD = 0x55555555;

const TRACK_AMIGADOS	= 0;
const TRACK_RAW		= 1;
const TRACK_RAW1		= 2;
const TRACK_PCDOS		= 3;
const TRACK_DISKSPARE= 4;
const TRACK_NONE		= 5;

const ADF_NONE		= -1;
const ADF_NORMAL	= 0;
const ADF_EXT1		= 1;
const ADF_EXT2		= 2;
/*const ADF_FDI		= 3;
const ADF_IPF		= 4;
const ADF_PCDOS	= 5;*/

function Track() {
	this.len = 0;
	this.offs = 0;
	this.bitlen = 0;
	this.sync = 0;
	this.type = TRACK_NONE;
}

function get_floppy_speed() {
	var speed = AMIGA.config.floppy.speed == SAEV_Config_Floppy_Speed_Turbo ? 100 : AMIGA.config.floppy.speed;
	return Math.floor((AMIGA.config.video.ntsc ? 1812 : 1829) * 100 / speed);
}    

function uaerand() {
	var l = 0, u = 0xffffffff;
	return Math.floor((Math.random() * (u - l + 1)) + l);	
}

function Drive(number) {
	this.num = number;
	this.diskdata = null;
	this.diskfile = null;
	//this.writediskfile = null;
	this.filetype = 0; //drive_filetype
	this.trackdata = new Array(MAX_TRACKS); for (var i = 0; i < MAX_TRACKS; i++) this.trackdata[i] = new Track();
	//this.writetrackdata = new Array(MAX_TRACKS);	for (var i = 0; i < MAX_TRACKS; i++) this.trackdata[i] = new Track();
	this.writebuffer = new Uint8Array(544 * MAX_SECTORS); for (var i = 0; i < 544 * MAX_SECTORS; i++) this.writebuffer[i] = 0;
	this.buffered_cyl = 0;
	this.buffered_side = 0;
	this.cyl = 0;
	this.motoroff = true;
	this.motordelay = false; /* dskrdy needs some clock cycles before it changes after switching off motor */
	//this.state = 0;
	this.wrprot = false;
	this.bigmfmbuf = new Uint16Array(0x4000 * DDHDMULT); for (var i = 0; i < 0x4000 * DDHDMULT; i++) this.bigmfmbuf[i] = 0;  
	this.tracktiming = new Uint16Array(0x4000 * DDHDMULT); for (var i = 0; i < 0x4000 * DDHDMULT; i++) this.tracktiming[i] = 0;
	this.skipoffset = 0;
	this.mfmpos = 0;
	this.indexoffset = 0;
	this.tracklen = 0;
	this.prevtracklen = 0;
	this.trackspeed = 0;
	this.num_tracks = 0;
	this.num_secs = 0;
	this.hard_num_cyls = 0;
	this.dskchange = false;
	this.dskchange_time = 0;
	this.dskready = false;
	this.dskready_up_time = 0;
	this.dskready_down_time = 0;
	this.writtento = 0;
	this.steplimit = 0;
	this.steplimitcycle = 0;
	this.indexhack = 0;
	this.indexhackmode = 0;
	this.ddhd = 0;
	this.idbit = 0;
	this.drive_id_scnt = 0;
	this.drive_id = DRIVE_ID_NONE;
	this.useturbo = false;
	this.floppybitcounter = 0;
	
	/*this.id_name = function () {
		switch (this.drive_id) {
			case DRIVE_ID_35HD :
				return '3.5HD';
			case DRIVE_ID_525SD:
				return '5.25SD';
			case DRIVE_ID_35DD :
				return '3.5DD';
			case DRIVE_ID_NONE :
				return 'NONE';
		}
		return 'UNKNOWN';
	};*/

	this.set_id = function () {
		switch (AMIGA.config.floppy.drive[this.num].type) {
			case SAEV_Config_Floppy_Type_35_HD:
			{
				if (FLOPPY_DRIVE_HD) {
					if (!this.diskfile || this.ddhd <= 1)
						this.drive_id = DRIVE_ID_35DD;
					else
						this.drive_id = DRIVE_ID_35HD;
				} else
					this.drive_id = DRIVE_ID_35DD;

				break;
			}
			case SAEV_Config_Floppy_Type_35_DD:
				this.drive_id = DRIVE_ID_35DD;
				break;
			case SAEV_Config_Floppy_Type_525_SD:
				this.drive_id = DRIVE_ID_525SD;
				break;
			case SAEV_Config_Floppy_Type_None:
				this.drive_id = DRIVE_ID_NONE;
				break;
			default:
				this.drive_id = DRIVE_ID_35DD;
		}
		//BUG.info('Drive.set_id() DF%d set to %s', this.num, this.id_name());
	};
	
	this.get_floppy_speed2 = function () {
		var m = Math.floor(get_floppy_speed() * this.tracklen / (2 * 8 * (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd));
		if (m <= 0) m = 1;
		return m;
	};
	
	this.reset = function () {
		//BUG.info('Drive.reset() DF%d', this.num);
		this.filetype = ADF_NONE;
		this.diskfile = null;
		//this.writediskfile = null;
		this.motoroff = true;
		this.idbit = 0;
		this.drive_id = 0;
		this.drive_id_scnt = 0;
		this.indexhackmode = 0;
		this.dskchange_time = 0;
		this.dskchange = false;
		this.dskready_down_time = 0;
		this.dskready_up_time = 0;
		this.buffered_cyl = -1;
		this.buffered_side = -1;
		if (this.num == 0 && AMIGA.config.floppy.drive[this.num].type == SAEV_Config_Floppy_Type_35_DD)
			this.indexhackmode = 1;
		this.set_id();
	};
	
	this.updatemfmpos = function () {
		if (this.prevtracklen)
			this.mfmpos = this.mfmpos * Math.floor(Math.floor(this.tracklen * 1000 / this.prevtracklen) / 1000);
		this.mfmpos %= this.tracklen;
		this.prevtracklen = this.tracklen;
	};
	
	this.reset_track = function () {
		//BUG.info('Drive.reset_track() DF%d', this.num);
		this.tracklen = (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd * 2 * 8;
		this.trackspeed = get_floppy_speed();
		this.buffered_side = -1;
		this.skipoffset = -1;
		this.tracktiming[0] = 0;
		for (var i = 0; i < (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd; i++) this.bigmfmbuf[i] = 0xaaaa; //memset (this.bigmfmbuf, 0xaa, (AMIGA.config.video.ntsc ? 6399 : 6334) * 2 * this.ddhd);
		this.updatemfmpos();
	};
	
	function strncmp_as(str1, str2, n) {
		for (var i = 0; i < n; i++) {
			if (str1[i] != (str2.charCodeAt(i) & 0xff))
				return 1;
		}
		return 0;
	}	
	/*function strncmp_aa(str1, str2, n) {
		for (var i = 0; i < n; i++) {
			if (str1[i] != str2[i])
				return 1;
		}
		return 0;
	}*/
	this.insert = function () {
		//BUG.info('DF%d.insert()', this.num);
		//const exeheader = [0x00,0x00,0x03,0xf3,0x00,0x00,0x00,0x00];

		this.filetype = ADF_NONE;
		this.diskfile = null;
		//this.writediskfile = null;
		this.ddhd = 1;
		this.num_secs = 0;
		this.hard_num_cyls = AMIGA.config.floppy.drive[this.num].type == SAEV_Config_Floppy_Type_525_SD ? 40 : 80;
		this.tracktiming[0] = 0;
		this.useturbo = false;
		this.indexoffset = 0;

		var size = 0;
		if (this.diskdata !== null) {
			this.diskfile = new Uint8Array(this.diskdata.length);
			for (var i = 0; i < this.diskdata.length; i++)
				this.diskfile[i] = this.diskdata[i];
			size = this.diskfile.length;
		}

		if (!this.motoroff) {
			this.dskready_up_time = DSKREADY_UP_TIME;
			this.dskready_down_time = 0;
		}
		if (this.diskfile === null) {
			this.reset_track();
			return 0;
		}

		if (strncmp_as(this.diskfile, 'UAE-1ADF', 8) == 0) {
			//BUG.info('DF%d.insert() UAE-1ADF', this.num);

			//read_header_ext2 (drv->diskfile, drv->trackdata, &drv->num_tracks, &drv->ddhd);
			this.filetype = ADF_EXT2;
			this.num_secs = 11;
			if (this.ddhd > 1)
				this.num_secs = 22;
		}
		else if (strncmp_as(this.diskfile, 'UAE--ADF', 8) == 0) {
			//BUG.info('DF%d.insert() UAE--ADF', this.num);
			var offs = 160 * 4 + 8;

			this.wrprot = true;
			this.filetype = ADF_EXT1;
			this.num_tracks = 160;
			this.num_secs = 11;

			for (var i = 0; i < this.num_tracks; i++) {
				var buffer = [];
				for (var j = 0; j < 4; j++)
					buffer[j] = this.diskfile[8 + i * 4 + j];

				this.trackdata[i].sync = buffer[0] * 256 + buffer[1];
				this.trackdata[i].len = buffer[2] * 256 + buffer[3];
				this.trackdata[i].offs = offs;

				if (this.trackdata[i].sync == 0) {
					this.trackdata[i].type = TRACK_AMIGADOS;
					this.trackdata[i].bitlen = 0;
				} else {
					this.trackdata[i].type = TRACK_RAW1;
					this.trackdata[i].bitlen = this.trackdata[i].len * 8;
				}
				offs += this.trackdata[i].len;
			}
		}
		/*else if (strncmp_aa(this.diskfile, exeheader, 8) == 0) {
		 //BUG.info('DF%d.insert() EXE', this.num);
		 //struct zfile *z = zfile_fopen_empty(NULL, "", 512 * 1760);
		 //createimagefromexe (drv->diskfile, z);
		 //zfile_fclose (drv->diskfile);

		 //this.diskfile = z;
		 this.filetype = ADF_NORMAL;
		 this.num_tracks = 160;
		 this.num_secs = 11;

		 for (var i = 0; i < this.num_tracks; i++) {
		 this.trackdata[i].type = TRACK_AMIGADOS;
		 this.trackdata[i].len = 512 * this.num_secs;
		 this.trackdata[i].bitlen = 0;
		 this.trackdata[i].offs = i * 512 * this.num_secs;
		 }
		 this.useturbo = true;
		 }*/
		else {
			this.filetype = ADF_NORMAL;

			/* high-density or diskspare disk? */
			var ds = false;
			this.num_tracks = 0;
			if (size > 160 * 11 * 512 + 511) { /* larger than standard adf? */
				for (var i = 80; i <= 83; i++) {
					if (size == i * 22 * 512 * 2) { // HD
						this.ddhd = 2;
						this.num_tracks = Math.floor(size / (512 * (this.num_secs = 22)));
						break;
					}
					if (size == i * 11 * 512 * 2) { // >80 cyl DD
						this.num_tracks = Math.floor(size / (512 * (this.num_secs = 11)));
						break;
					}
					if (size == i * 12 * 512 * 2) { // ds 12 sectors
						this.num_tracks = Math.floor(size / (512 * (this.num_secs = 12)));
						ds = true;
						break;
					}
					if (size == i * 24 * 512 * 2) { // ds 24 sectors
						this.num_tracks = Math.floor(size / (512 * (this.num_secs = 24)));
						this.ddhd = 2;
						ds = true;
						break;
					}
				}
				if (this.num_tracks == 0) {
					this.num_tracks = Math.floor(size / (512 * (this.num_secs = 22)));
					this.ddhd = 2;
				}
			} else
				this.num_tracks = Math.floor(size / (512 * (this.num_secs = 11)));

			if (!ds && this.num_tracks > MAX_TRACKS)
				Fatal(SAEE_Disk_File_Too_Big, sprintf('The diskfile in DF%d is too big. (%d tracks)', this.num, this.num_tracks));

			for (var i = 0; i < this.num_tracks; i++) {
				this.trackdata[i].type = ds ? TRACK_DISKSPARE : TRACK_AMIGADOS;
				this.trackdata[i].len = 512 * this.num_secs;
				this.trackdata[i].bitlen = 0;
				this.trackdata[i].offs = i * 512 * this.num_secs;
			}
		}
		this.set_id();
		this.fill_bigbuf(AMIGA.disk.side, 1);

		this.mfmpos = uaerand();
		this.mfmpos |= (uaerand() << 16);
		this.mfmpos %= this.tracklen;
		this.prevtracklen = 0;
		return 1;
	};
	
	this.eject = function () {
		//BUG.info('DF%d.eject()', this.num);
		this.filetype = ADF_NONE;
		this.diskfile = null;
		//this.writediskfile = null;
		this.dskchange = true;
		this.dskchange_time = 0;
		this.dskready = false;
		this.dskready_up_time = 0;
		this.dskready_down_time = 0;
		this.ddhd = 1;
		this.set_id();
	};
	
	this.is_empty = function () {
		return this.diskfile === null;
	};

	this.set_steplimit = function () {
		this.steplimit = 10;
		this.steplimitcycle = AMIGA.events.currcycle;
	};
	
	this.step = function () {
		if (!this.is_empty())
			this.dskchange = 0;

		if (this.steplimit && AMIGA.events.currcycle - this.steplimitcycle < MIN_STEPLIMIT_CYCLE) {
			BUG.info('Drive.step() DF%d, ignoring step %d', this.num, Math.floor((AMIGA.events.currcycle - this.steplimitcycle) * CYCLE_UNIT_INV));
			return;
		}

		this.set_steplimit();

		if (AMIGA.disk.direction) {
			if (this.cyl)
				this.cyl--;
			//else BUG.info('Drive.step() DF%d, program tried to step beyond track zero', this.num); //'no-click' programs does that
		} else {
			var maxtrack = this.hard_num_cyls;
			if (this.cyl < maxtrack + 3)
				this.cyl++;
			//if (this.cyl >= maxtrack) BUG.info('Drive.step() DF%d, program tried to step over track %d', this.num, maxtrack); //'no-click' programs does that
		}
		AMIGA.disk.rand_shifter();
		AMIGA.config.hooks.floppy_step(this.num, this.cyl);
	};

	this.is_track0 = function () {
		return this.cyl == 0;
	};

	this.is_writeprotected = function () {
		return this.wrprot || this.diskfile === null;
	};

	this.is_running = function () {
		return !this.motoroff;
	};
	
	this.set_motor = function (off) {
		if (this.motoroff && !off) {
			this.dskready_up_time = DSKREADY_UP_TIME;
			AMIGA.disk.rand_shifter();
		}
		if (!this.motoroff && off) {
			this.drive_id_scnt = 0;
			/* Reset id shift reg counter */
			this.dskready_down_time = DSKREADY_DOWN_TIME;

			if (AMIGA.config.cpu.model <= 68010 && AMIGA.config.cpu.speed == SAEV_Config_CPU_Speed_Original) {
				this.motordelay = true;
				AMIGA.events.newevent2(30, this.num, function (v) {
					AMIGA.disk.motordelay_func(v);
				});
			}
		}
		this.motoroff = off;
		if (this.motoroff) {
			this.dskready = false;
			this.dskready_up_time = 0;
		} else {
			this.dskready_down_time = 0;
		}
	};
	
	/* get one bit from MFM bit stream */
	this.getonebit = function (mfmpos) {
		return (this.bigmfmbuf[mfmpos >> 4] & (1 << (15 - (mfmpos & 15)))) ? 1 : 0;
	};
	this.decode_amigados = function () {
		var gap_len = AMIGA.config.video.ntsc ? 415 : 350;
		var tr = this.cyl * 2 + AMIGA.disk.side;
		var len = this.num_secs * 544 + gap_len;
		var bigmfmpos = gap_len;
		var sec;
		var i;

		for (i = 0; i < len; i++)
			this.bigmfmbuf[i] = 0xaaaa;

		this.skipoffset = Math.floor((gap_len * 8) / 3) * 2;
		this.tracklen = len * 2 * 8;

		for (sec = 0; sec < this.num_secs; sec++) {
			var secbuf = new Uint8Array(544);
			var mfmbuf = new Uint16Array(544);
			var deven, dodd;
			var hck = 0, dck = 0;

			secbuf[0] = secbuf[1] = 0x00;
			secbuf[2] = secbuf[3] = 0xa1;
			secbuf[4] = 0xff;
			secbuf[5] = tr;
			secbuf[6] = sec;
			secbuf[7] = this.num_secs - sec;

			for (i = 8; i < 24; i++)
				secbuf[i] = 0;

			//read_floppy_data (this.diskfile, ti, sec * 512, &secbuf[32], 512);
			{
				var offset = this.trackdata[tr].offs + sec * 512;
				for (i = 0; i < 512; i++) secbuf[32 + i] = this.diskfile[offset + i];
			}

			mfmbuf[0] = mfmbuf[1] = 0xaaaa;
			mfmbuf[2] = mfmbuf[3] = 0x4489;

			deven = ((secbuf[4] << 24) | (secbuf[5] << 16) | (secbuf[6] << 8) | (secbuf[7])) >>> 0;
			dodd = deven >>> 1;
			deven &= 0x55555555;
			dodd &= 0x55555555;

			mfmbuf[4] = dodd >>> 16;
			mfmbuf[5] = dodd & 0xffff;
			mfmbuf[6] = deven >>> 16;
			mfmbuf[7] = deven & 0xffff;

			for (i = 8; i < 48; i++)
				mfmbuf[i] = 0xaaaa;
			for (i = 0; i < 512; i += 4) {
				deven = ((secbuf[i + 32] << 24) | (secbuf[i + 33] << 16) | (secbuf[i + 34] << 8) | (secbuf[i + 35])) >>> 0;
				dodd = deven >>> 1;
				deven &= 0x55555555;
				dodd &= 0x55555555;
				mfmbuf[(i >> 1) + 32] = dodd >>> 16;
				mfmbuf[(i >> 1) + 33] = dodd & 0xffff;
				mfmbuf[(i >> 1) + 256 + 32] = deven >>> 16;
				mfmbuf[(i >> 1) + 256 + 33] = deven & 0xffff;
			}

			for (i = 4; i < 24; i += 2)
				hck ^= ((mfmbuf[i] << 16) | mfmbuf[i + 1]) >>> 0;

			deven = dodd = hck;
			dodd >>>= 1;
			mfmbuf[24] = dodd >>> 16;
			mfmbuf[25] = dodd & 0xffff;
			mfmbuf[26] = deven >>> 16;
			mfmbuf[27] = deven & 0xffff;

			for (i = 32; i < 544; i += 2)
				dck ^= ((mfmbuf[i] << 16) | mfmbuf[i + 1]) >>> 0;

			deven = dodd = dck;
			dodd >>>= 1;
			mfmbuf[28] = dodd >>> 16;
			mfmbuf[29] = dodd & 0xffff;
			mfmbuf[30] = deven >>> 16;
			mfmbuf[31] = deven & 0xffff;

			//mfmcode (mfmbuf + 4, 544 - 4); static this.mfmcode (var * mfm, var words)
			{
				var words = 540, lastword = 0, pos = 4;
				while (words--) {
					//var v = *mfm;
					var v = mfmbuf[pos];
					var lv = ((lastword << 16) | v) >>> 0;
					var nlv = (0x55555555 & ~lv) >>> 0;
					var mfmbits = (((nlv << 1) & (nlv >>> 1)) >>> 0) & 0xffff;
					//*mfm++ = v | mfmbits;
					mfmbuf[pos] = v | mfmbits;
					lastword = v;
					pos++;
				}
			}

			for (i = 0; i < 544; i++) {
				this.bigmfmbuf[bigmfmpos % len] = mfmbuf[i];
				bigmfmpos++;
			}
		}
	};

	this.decode_raw = function () {
		var tr = this.cyl * 2 + AMIGA.disk.side;

		var base_offset = this.trackdata[tr].type == TRACK_RAW ? 0 : 1;
		this.tracklen = this.trackdata[tr].bitlen + 16 * base_offset;
		this.bigmfmbuf[0] = this.trackdata[tr].sync;
		var len = Math.floor((this.trackdata[tr].bitlen + 7) / 8);
		var buf = new Uint8Array(len);

		//read_floppy_data (this.diskfile, ti, 0, (var*)(this.bigmfmbuf + base_offset), Math.floor((ti->bitlen + 7) / 8));
		{
			var offset = this.trackdata[tr].offs;
			for (var i = 0; i < len; i++)
				buf[i] = this.diskfile[offset + i];
		}

		for (var i = base_offset; i < Math.floor((this.tracklen + 15) / 16); i++)
			this.bigmfmbuf[i] = 256 * buf[(i - base_offset) << 1] + buf[((i - base_offset) << 1) + 1];

		//BUG.info('DF%d.decode_raw() rawtrack %d, offset %d', this.num, tr, this.trackdata[tr].offs);
	};
	
	this.fill_bigbuf = function (force) {
		var tr = this.cyl * 2 + AMIGA.disk.side;

		if (!this.diskfile || tr >= this.num_tracks) {
			this.reset_track();
			return;
		}
		if (!force && this.buffered_cyl == this.cyl && this.buffered_side == AMIGA.disk.side)
			return;

		this.indexoffset = 0;
		this.tracktiming[0] = 0;
		this.skipoffset = -1;

		/*if (this.writediskfile && this.writetrackdata[tr].bitlen > 0) {
		 var i;
		 Track *wti = &this.writetrackdata[tr];
		 this.tracklen = wti->bitlen;
		 read_floppy_data (this.writediskfile, wti, 0, (var*)this.bigmfmbuf, Math.floor((wti->bitlen + 7) / 8));
		 for (i = 0; i < Math.floor((this.tracklen + 15) / 16); i++) {
		 var *mfm = this.bigmfmbuf + i;
		 var *data = (var *) mfm;
		 *mfm = 256 * *data + *(data + 1);
		 }
		 write_log ('track %d, length %d read from \'saveimage\'\n', tr, this.tracklen);
		 } else*/
		if (this.trackdata[tr].type == TRACK_NONE) {
		}
		else if (this.trackdata[tr].type == TRACK_AMIGADOS)
			this.decode_amigados();
		else if (this.trackdata[tr].type == TRACK_DISKSPARE)
			this.decode_diskspare();
		else if (this.trackdata[tr].type == TRACK_PCDOS)
			this.decode_pcdos();
		else
			this.decode_raw();

		this.buffered_side = AMIGA.disk.side;
		this.buffered_cyl = this.cyl;
		if (this.tracklen == 0) {
			this.tracklen = (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd * 2 * 8;
			for (var i = 0; i < (AMIGA.config.video.ntsc ? 6399 : 6334) * this.ddhd; i++) this.bigmfmbuf[i] = 0; //memset (this.bigmfmbuf, 0, (AMIGA.config.video.ntsc ? 6399 : 6334) * 2 * this.ddhd);
		}

		this.trackspeed = this.get_floppy_speed2();
		this.updatemfmpos();
	};

	this.getmfmword = function (mbuf, shift) {
		return (((this.bigmfmbuf[mbuf] << shift) | (this.bigmfmbuf[mbuf + 1] >>> (16 - shift))) >>> 0) & 0xffff;
	};
	this.getmfmlong = function (mbuf, shift) {
		return (((this.getmfmword(mbuf, shift) << 16) | this.getmfmword(mbuf + 1, shift)) >>> 0) & 0x55555555;
	};
	this.decode_buffer = function (checkmode) {
		var mbuf = 0;
		var cyl = this.cyl;
		var drvsec = this.num_secs;
		var ddhd = this.ddhd;
		var filetype = this.filetype;

		var i, secwritten = 0;
		var fwlen = (AMIGA.config.video.ntsc ? 6399 : 6334) * ddhd;
		var length = 2 * fwlen;
		var odd, even, chksum, id, dlong;
		var secbuf = new Uint8Array(544);
		var sectable = new Array(22);
		var mend = length - (4 + 16 + 8 + 512);
		var shift = 0;

		for (i = 0; i < sectable.length; i++) sectable[i] = 0; //memset (sectable, 0, sizeof (sectable));
		for (i = 0; i < fwlen; i++) this.bigmfmbuf[fwlen + i] = this.bigmfmbuf[i]; //memcpy (mbuf + fwlen, mbuf, fwlen * sizeof(uae_u16));

		while (secwritten < drvsec) {
			while (this.getmfmword(mbuf, shift) != 0x4489) {
				if (mbuf >= mend) return 1;
				shift++;
				if (shift == 16) {
					shift = 0;
					mbuf++;
				}
			}
			while (this.getmfmword(mbuf, shift) == 0x4489) {
				if (mbuf >= mend) return 10;
				mbuf++;
			}

			odd = this.getmfmlong(mbuf, shift);
			even = this.getmfmlong(mbuf + 2, shift);
			mbuf += 4;
			id = (((odd << 1) | even) >>> 0) & 0xffffffff;

			var trackoffs = (id & 0xff00) >>> 8;
			if (trackoffs + 1 > drvsec) {
				BUG.info('DF%d.decode_buffer() weird sector number %d', this.num, trackoffs);
				if (filetype == ADF_EXT2) return 2;
				continue;
			}
			chksum = (odd ^ even) >>> 0;
			for (i = 0; i < 4; i++) {
				odd = this.getmfmlong(mbuf, shift);
				even = this.getmfmlong(mbuf + 8, shift);
				mbuf += 2;

				dlong = (((odd << 1) | even) >>> 0) & 0xffffffff;
				if (dlong && !checkmode) {
					if (filetype == ADF_EXT2) return 6;
					secwritten = -200;
				}
				chksum ^= odd ^ even;
				chksum &= 0xffffffff;
			}
			mbuf += 8;
			odd = this.getmfmlong(mbuf, shift);
			even = this.getmfmlong(mbuf + 2, shift);
			mbuf += 4;
			if (((((odd << 1) | even) >>> 0) & 0xffffffff) != chksum || ((id & 0x00ff0000) >> 16) != cyl * 2 + AMIGA.disk.side) {
				BUG.info('DF%d.decode_buffer() checksum error on sector %d header', this.num, trackoffs);
				if (filetype == ADF_EXT2) return 3;
				continue;
			}
			odd = this.getmfmlong(mbuf, shift);
			even = this.getmfmlong(mbuf + 2, shift);
			mbuf += 4;
			chksum = (((odd << 1) | even) >>> 0) & 0xffffffff;
			for (i = 0; i < 512; i += 4) {
				odd = this.getmfmlong(mbuf, shift);
				even = this.getmfmlong(mbuf + 256, shift);
				mbuf += 2;
				dlong = (((odd << 1) | even) >>> 0) & 0xffffffff;
				secbuf[32 + i] = (dlong >>> 24) & 0xff;
				secbuf[33 + i] = (dlong >>> 16) & 0xff;
				secbuf[34 + i] = (dlong >>> 8) & 0xff;
				secbuf[35 + i] = dlong & 0xff;
				chksum ^= odd ^ even;
				chksum &= 0xffffffff;
			}
			if (chksum) {
				BUG.info('DF%d.decode_buffer() sector %d, data checksum error', this.num, trackoffs);
				if (filetype == ADF_EXT2) return 4;
				continue;
			}
			mbuf += 256;
			sectable[trackoffs] = 1;
			secwritten++;

			for (i = 0; i < 512; i++) this.writebuffer[trackoffs * 512 + i] = secbuf[32 + i]; //memcpy (writebuffer + trackoffs * 512, secbuf + 32, 512);
		}
		if (filetype == ADF_EXT2 && (secwritten == 0 || secwritten < 0))
			return 5;
		if (secwritten == 0) BUG.info('DF%d.decode_buffer() unsupported format', this.num);
		if (secwritten < 0) BUG.info('DF%d.decode_buffer() sector labels ignored', this.num);

		return 0;
	};
	
	this.write_adf_amigados = function () {
		//var drvsec, i;
		//var sectable[MAX_SECTORS];

		if (this.decode_buffer(0)) //drv->bigmfmbuf, drv->cyl, drv->num_secs, drv->ddhd, drv->filetype, &drvsec, sectable, 0))
			return 2;
		//if (!drvsec) return 2;

		/*for (i = 0; i < drvsec; i++) {
		 zfile_fseek (drv->diskfile, drv->trackdata[drv->cyl * 2 + AMIGA.disk.side].offs + i * 512, SEEK_SET);
		 zfile_fwrite (writebuffer + i * 512, sizeof (var), 512, drv->diskfile);
		 }*/
		for (var i = 0; i < this.num_secs; i++) {
			var offset = this.trackdata[this.cyl * 2 + AMIGA.disk.side].offs + i * 512;
			for (var j = 0; j < 512; j++)
				this.diskfile[offset + j] = this.diskdata[offset + j] = this.writebuffer[i * 512 + j];
		}
		return 0;
	};

	this.write_data = function () {
		var tr = this.cyl * 2 + AMIGA.disk.side;

		if (this.is_writeprotected() || this.trackdata[tr].type == TRACK_NONE) {
			this.buffered_side = 2;
			return;
		}
		//if (this.writediskfile) drive_write_ext2 (this.bigmfmbuf, this.writediskfile, &this.writetrackdata[tr], LONGWRITEMODE ? dsklength2 * 8 : this.tracklen);

		switch (this.filetype) {
			case ADF_NORMAL:
			{
				if (this.write_adf_amigados()) {
					//notify_user (NUMSG_NEEDEXT2);
				}
				return;
			}
		}
		this.tracktiming[0] = 0;
	};
	
	this.is_unformatted = function () {
		var tr = this.cyl * 2 + AMIGA.disk.side;
		if (tr >= this.num_tracks) return true;
		if (this.filetype == ADF_EXT2 && this.trackdata[tr].bitlen == 0 && this.trackdata[tr].type != TRACK_AMIGADOS)
			return true;

		return this.trackdata[tr].type == TRACK_NONE;
	};
	
	this.vsync = function() {
		if (this.dskready_down_time > 0)
			this.dskready_down_time--;
		/* emulate drive motor turn on time */
		if (this.dskready_up_time > 0 && !this.is_empty()) {
			if ((--this.dskready_up_time) == 0 && !this.motoroff)
				this.dskready = true;
		}
		/* delay until new disk image is inserted */
		if (this.dskchange_time) {
			if ((--this.dskchange_time) == 0)
				this.insert();
		}
	}
}

function Disk() {
	this.side = 0;
	this.direction = 0;
	var selected = 15;
	var disabled = 0;	
	var dskdmaen = DSKDMA_OFF;
	var dsklength = 0;
	var dsklength2 = 0;
	var dsklen = 0;
	var dskbytr_val = 0;
	var dskpt = 0;
	var fifo = new Array(3); for (var i = 0; i < 3; i++) fifo[i] = 0;   
	var fifo_inuse = new Array(3); for (var i = 0; i < 3; i++) fifo_inuse[i] = 0;   
	var fifo_filled = false;
	var dma_enable = false;
	var bitoffset = 0;
	var word = 0;
	var dsksync = 0;
	var dsksync_cycles = 0;
	var disk_hpos = 0;
	var disk_jitter = 0;
	var indexdecay = 0;
	var prev_data = 0;
	var prev_step = 0;
	var linecounter = 0;
	var random_bits_min = 1;
	var random_bits_max = 3;
	var ledstate = new Array(MAX_FLOPPY_DRIVES); for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) ledstate[i] = false;		
	var floppy = new Array(MAX_FLOPPY_DRIVES); for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) floppy[i] = new Drive(i);

	this.setup = function () {
	};

	this.reset = function () {
		disk_hpos = 0;
		dskdmaen = DSKDMA_OFF;
		disabled = 0;
		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			floppy[i].reset();
			ledstate[i] = false;
			AMIGA.config.hooks.floppy_motor(i, false);
			AMIGA.config.hooks.floppy_step(i, floppy[i].cyl);
		}
		this.DSKLEN(0, 0);
		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			this.eject(i);
			this.insert(i);
		}
	};
	
	this.rand_shifter = function () {
		var r = ((uaerand() >>> 4) & 7) + 1;
		while (r-- > 0) {
			word <<= 1;
			word |= (uaerand() & 0x1000) ? 1 : 0;
			bitoffset++;
			bitoffset &= 15;
		}
	};

	this.setdskchangetime = function (num, dsktime) {
		if (floppy[num].dskchange_time > 0)
			return;

		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			if (floppy[i].num != num && floppy[i].dskchange_time > 0 && floppy[i].dskchange_time + 1 >= dsktime)
				dsktime = floppy[i].dskchange_time + 1;
		}
		floppy[num].dskchange_time = dsktime;
		//BUG.info('Disk.setdskchangetime() delayed insert enable %d', dsktime);
	};

	this.insert2 = function (num, forced) {
		//BUG.info('Disk.insert() DF%d', num);

		if (AMIGA.config.floppy.drive[num].name && AMIGA.config.floppy.drive[num].data) {
			floppy[num].diskdata = new Uint8Array(AMIGA.config.floppy.drive[num].data.length);
			for (var i = 0; i < AMIGA.config.floppy.drive[num].data.length; i++)
				floppy[num].diskdata[i] = AMIGA.config.floppy.drive[num].data.charCodeAt(i) & 0xff;
		}

		if (forced) {
			if (!floppy[num].is_empty())
				floppy[num].eject();
			floppy[num].insert(null);
			return;
		}

		if (!floppy[num].is_empty() || floppy[num].dskchange_time > 0) {
			floppy[num].eject();
			this.setdskchangetime(num, 100);
		} else
			this.setdskchangetime(num, 1);
	};
	this.insert = function (num) {
		this.insert2(num, false);
	};
			
	this.eject = function (num) {
		floppy[num].eject();
		floppy[num].diskdata = null;
	};
	
	this.is_empty = function (num) {
		return floppy[num].is_empty();
	};

	this.select_fetch = function (data) {
		selected = (data >> 3) & 15;
		this.side = 1 - ((data >> 2) & 1);
		this.direction = (data >> 1) & 1;
	};
	
	this.select_set = function (data) {
		prev_data = data;
		prev_step = data & 1;

		this.select_fetch(data);
	};
	
	this.select = function (data) {
		//BUG.info('Disk.select() $%02x', data);
		var step_pulse, prev_selected, dr;

		prev_selected = selected;
		this.select_fetch(data);
		step_pulse = data & 1;

		if ((prev_data & 0x80) != (data & 0x80)) {
			for (dr = 0; dr < 4; dr++) {
				if (floppy[dr].indexhackmode > 1 && !(selected & (1 << dr))) {
					floppy[dr].indexhack = 1;
					BUG.info('Disk.select() indexhack!');
				}
			}
		}
		if (prev_step != step_pulse) {
			prev_step = step_pulse;
			if (prev_step) {
				for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
					if (!((prev_selected | disabled) & (1 << dr))) {
						floppy[dr].step();
						if (floppy[dr].indexhackmode > 1 && (data & 0x80))
							floppy[dr].indexhack = 1;
					}
				}
			}
		}
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (!(selected & (1 << dr)) && (prev_selected & (1 << dr))) {
				floppy[dr].drive_id_scnt++;
				floppy[dr].drive_id_scnt &= 31;
				floppy[dr].idbit = (floppy[dr].drive_id & (1 << (31 - floppy[dr].drive_id_scnt))) ? 1 : 0;

				if (!(disabled & (1 << dr))) {
					if ((prev_data & 0x80) == 0 || (data & 0x80) == 0)
						floppy[dr].set_motor(0); /* motor off: if motor bit = 0 in prevdata or data -> turn motor on */
					else if (prev_data & 0x80)
						floppy[dr].set_motor(1);
					/* motor on: if motor bit = 1 in prevdata only (motor flag state in data has no effect) -> turn motor off */
				}
				if (dr == 0)
					floppy[dr].idbit = 0;
			}
		}
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			var state = (!(selected & (1 << dr))) | !floppy[dr].motoroff;
			if (ledstate[dr] != state) {
				ledstate[dr] = state;
				AMIGA.config.hooks.floppy_motor(dr, ledstate[dr]);
			}
		}
		prev_data = data;
	};

	this.status = function () {
		var st = 0x3c;

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (!((selected | disabled) & (1 << dr))) {
				if (floppy[dr].is_running()) {
					if (floppy[dr].dskready && !floppy[dr].indexhack)
						st &= ~0x20;
				} else {
					if (dr > 0) {
						if (floppy[dr].idbit)
							st &= ~0x20;
					} else {
						/* non-ID internal drive: mirror real dskready */
						if (floppy[dr].dskready)
							st &= ~0x20;
					}
					/* dskrdy needs some cycles after switching the motor off.. (Pro Tennis Tour) */
					if (dr == 0 && floppy[dr].motordelay)
						st &= ~0x20;
				}
				if (floppy[dr].is_track0())
					st &= ~0x10;
				if (floppy[dr].is_writeprotected())
					st &= ~8;
				if (floppy[dr].dskchange && AMIGA.config.floppy.drive[dr].type != SAEV_Config_Floppy_Type_525_SD)
					st &= ~4;
			} else if (!(selected & (1 << dr))) {
				if (floppy[dr].idbit)
					st &= ~0x20;
			}
		}
		//BUG.info('Disk.status() $%02x', st);
		return st;
	};
	
	this.fetchnextrevolution = function (num) {
		floppy[num].trackspeed = floppy[num].get_floppy_speed2();
	};

	this.handler = function (data) {
		var flag = data & 255;
		var disk_sync_cycle = data >> 8;
		//BUG.info('Disk.handler() data $%x, flag %d, disk_sync_cycle %d', data, flag, disk_sync_cycle);

		AMIGA.events.remevent(EV2_DISK);

		this.update(disk_sync_cycle);

		if (flag & (DISK_REVOLUTION << 0)) this.fetchnextrevolution(0);
		if (flag & (DISK_REVOLUTION << 1)) this.fetchnextrevolution(1);
		if (flag & (DISK_REVOLUTION << 2)) this.fetchnextrevolution(2);
		if (flag & (DISK_REVOLUTION << 3)) this.fetchnextrevolution(3);
		if (flag & DISK_WORDSYNC)
			AMIGA.INTREQ(INT_DSKSYN);
		if (flag & DISK_INDEXSYNC) {
			if (!indexdecay) {
				indexdecay = 2;
				//AMIGA.cia.setICR(CIA_B, 0x10, null);
				//AMIGA.cia.diskindex();
				AMIGA.cia.SetICRB(0x10, null);
			}
		}
	};
	
	this.update_jitter = function () {
		if (random_bits_max > 0)
			disk_jitter = ((uaerand() >>> 4) % (random_bits_max - random_bits_min + 1)) + random_bits_min;
		else
			disk_jitter = 0;
	};

	this.updatetrackspeed = function (num, mfmpos) {
		if (dskdmaen < DSKDMA_WRITE) {
			var t = floppy[num].tracktiming[Math.floor(mfmpos / 8)];
			floppy[num].trackspeed = Math.floor(floppy[num].get_floppy_speed2() * t / 1000);
			if (floppy[num].trackspeed < 700 || floppy[num].trackspeed > 3000) {
				BUG.info('Disk.updatetrackspeed() corrupted trackspeed value %d', floppy[num].trackspeed);
				floppy[num].trackspeed = 1000;
			}
		}
	};

	this.fifostatus = function () {
		if (fifo_inuse[0] && fifo_inuse[1] && fifo_inuse[2])
			return 1;
		else if (!fifo_inuse[0] && !fifo_inuse[1] && !fifo_inuse[2])
			return -1;
		return 0;
	};
	
	this.dmafinished = function () {
		//BUG.info('Disk.dmafinished()');
		AMIGA.INTREQ(INT_DSKBLK);
		//LONGWRITEMODE = 0;
		dskdmaen = DSKDMA_OFF;
		dsklength = 0;
	};

	this.readdma = function () {
		if (AMIGA.dmaen(DMAF_DSKEN) && bitoffset == 15 && dma_enable && dskdmaen == DSKDMA_READ && dsklength >= 0) {
			if (dsklength > 0) {
				if (dsklength == 1 && dsklength2 == 1) {
					this.dmafinished();
					return 0;
				}
				/* fast disk modes, just flush the fifo */
				if (AMIGA.config.floppy.speed > SAEV_Config_Floppy_Speed_Original && fifo_inuse[0] && fifo_inuse[1] && fifo_inuse[2]) {
					while (fifo_inuse[0]) {
						var w = this.DSKDATR();
						AMIGA.mem.store16(dskpt, w);
						dskpt += 2;
					}
				}
				if (this.fifostatus() > 0) {
					BUG.info('Disk.readdma() fifo overflow detected, retrying...');
					return -1;
				} else {
					this.DSKDAT(word);
					dsklength--;
				}
			}
			return 1;
		}
		return 0;
	};

	this.update_read_nothing = function (floppybits) {
		//BUG.info('Disk.update_read_nothing() floppybits %d', floppybits);

		while (floppybits >= get_floppy_speed()) {
			word <<= 1;
			this.readdma();
			word &= 0xffff;
			if ((bitoffset & 7) == 7) {
				dskbytr_val = word & 0xff;
				dskbytr_val |= 0x8000;
			}
			bitoffset++;
			bitoffset &= 15;
			floppybits -= get_floppy_speed();
		}
	};

	/*static this.read_floppy_data (struct zfile *diskfile, Track *tid, var offset, var *dst, var len) {
		if (len == 0)
			return;
		zfile_fseek (diskfile, tid->offs + offset, SEEK_SET);
		zfile_fread (dst, 1, len, diskfile);
	}*/

	this.update_read = function (num, floppybits) {
		//BUG.info('Disk.update_read() DF%d, floppybits %d', num, floppybits);

		while (floppybits >= floppy[num].trackspeed) {
			var oldmfmpos = floppy[num].mfmpos;
			if (floppy[num].tracktiming[0])
				this.updatetrackspeed(num, floppy[num].mfmpos);

			word <<= 1;
			if (!floppy[num].is_empty()) {
				if (floppy[num].is_unformatted())
					word |= ((uaerand() & 0x1000) ? 1 : 0);
				else
					word |= floppy[num].getonebit(floppy[num].mfmpos);
			}
			word &= 0xffff;

			floppy[num].mfmpos++;
			floppy[num].mfmpos %= floppy[num].tracklen;
			if (floppy[num].mfmpos == floppy[num].indexoffset) {
				//if (floppy[num].indexhack) BUG.info('Disk.update_read() indexhack cleared');
				floppy[num].indexhack = 0;
			}
			if (floppy[num].mfmpos == floppy[num].skipoffset) {
				this.update_jitter();
				floppy[num].mfmpos += disk_jitter;
				floppy[num].mfmpos %= floppy[num].tracklen;
			}
			if (this.readdma() < 0) {
				floppy[num].mfmpos = oldmfmpos;
				return;
			}
			if ((bitoffset & 7) == 7) {
				dskbytr_val = word & 0xff;
				dskbytr_val |= 0x8000;
			}
			if (word == dsksync) {
				dsksync_cycles = AMIGA.events.currcycle + WORDSYNC_TIME * CYCLE_UNIT;
				if (dskdmaen != DSKDMA_OFF) {
					//if (!dma_enable) BUG.info('Disk.update_read() Sync match, DMA started at %d', floppy[num].mfmpos);
					dma_enable = true;
				}
				if (AMIGA.adkcon & 0x400) {
					bitoffset = 15;
				}
			}
			bitoffset++;
			bitoffset &= 15;
			floppybits -= floppy[num].trackspeed;
		}
	};
	
	this.update_write = function (num, floppybits) {
		var dr, drives = [0, 0, 0, 0];

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			drives[dr] = 0;
			if (floppy[dr].motoroff)
				continue;
			if (selected & (1 << dr))
				continue;
			drives[dr] = 1;
		}
		while (floppybits >= floppy[num].trackspeed) {
			for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
				if (drives[dr]) {
					floppy[dr].mfmpos++;
					floppy[dr].mfmpos %= floppy[num].tracklen;
				}
			}
			if (AMIGA.dmaen(DMAF_DSKEN) && dskdmaen == DSKDMA_WRITE && dsklength > 0 && fifo_filled) {
				bitoffset++;
				bitoffset &= 15;
				if (!bitoffset) {
					/* fast disk modes, fill the fifo instantly */
					if (AMIGA.config.floppy.speed > SAEV_Config_Floppy_Speed_Original && !fifo_inuse[0] && !fifo_inuse[1] && !fifo_inuse[2]) {
						while (!fifo_inuse[2]) {
							var w = AMIGA.mem.load16(dskpt);
							this.DSKDAT(w);
							dskpt += 2;
						}
					}
					if (this.fifostatus() >= 0) {
						var w = this.DSKDATR();
						for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
							if (drives[dr]) {
								floppy[dr].bigmfmbuf[floppy[dr].mfmpos >> 4] = w;
								floppy[dr].bigmfmbuf[(floppy[dr].mfmpos >> 4) + 1] = 0x5555;
								floppy[dr].writtento = 1;
							}
						}
						dsklength--;
						if (dsklength <= 0) {
							this.dmafinished();
							for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
								floppy[dr].writtento = 0;
								if (floppy[dr].motoroff)
									continue;
								if (selected & (1 << dr))
									continue;
								floppy[dr].write_data();
							}
						}
					}
				}
			}
			floppybits -= floppy[num].trackspeed;
		}
	};
	
	this.doupdate_predict = function (startcycle) {
		//BUG.info('Disk.doupdate_predict() startcycle %d', startcycle);
		var finaleventcycle = AMIGA.playfield.maxhpos << 8;
		var finaleventflag = 0;

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (selected & (1 << dr))
				continue;
			else if (floppy[dr].motoroff || !floppy[dr].trackspeed)
				continue;

			var diskevent_flag = 0;
			var tword = word;
			var countcycle = startcycle + (floppy[dr].floppybitcounter % floppy[dr].trackspeed);
			var mfmpos = floppy[dr].mfmpos;
			while (countcycle < (AMIGA.playfield.maxhpos << 8)) {
				if (floppy[dr].tracktiming[0])
					this.updatetrackspeed(dr, mfmpos);
				if (dskdmaen != DSKDMA_WRITE || (dskdmaen == DSKDMA_WRITE && !dma_enable)) {
					tword <<= 1;
					if (!floppy[dr].is_empty()) {
						if (floppy[dr].is_unformatted())
							tword |= ((uaerand() & 0x1000) ? 1 : 0);
						else
							tword |= floppy[dr].getonebit(mfmpos);
					}
					tword &= 0xffff;
					if (tword == dsksync && dsksync != 0)
						diskevent_flag |= DISK_WORDSYNC;
				}
				mfmpos++;
				mfmpos %= floppy[dr].tracklen;
				if (mfmpos == 0)
					diskevent_flag |= (DISK_REVOLUTION << dr);
				if (mfmpos == floppy[dr].indexoffset)
					diskevent_flag |= DISK_INDEXSYNC;
				if (dskdmaen != DSKDMA_WRITE && mfmpos == floppy[dr].skipoffset) {
					this.update_jitter();
					var skipcnt = disk_jitter;
					while (skipcnt-- > 0) {
						mfmpos++;
						mfmpos %= floppy[dr].tracklen;
						if (mfmpos == 0)
							diskevent_flag |= (DISK_REVOLUTION << dr);
						if (mfmpos == floppy[dr].indexoffset)
							diskevent_flag |= DISK_INDEXSYNC;
					}
				}
				if (diskevent_flag)
					break;
				countcycle += floppy[dr].trackspeed;
			}
			if (floppy[dr].tracktiming[0])
				this.updatetrackspeed(dr, floppy[dr].mfmpos);
			if (diskevent_flag && countcycle < finaleventcycle) {
				finaleventcycle = countcycle;
				finaleventflag = diskevent_flag;
			}
		}

		if (finaleventflag && (finaleventcycle >>> 8) < AMIGA.playfield.maxhpos)
			AMIGA.events.newevent(EV2_DISK, (finaleventcycle - startcycle) >>> 8, ((finaleventcycle >>> 8) << 8) | finaleventflag);
	};

	this.update = function (tohpos) {
		//if (tohpos != 227) BUG.info('Disk.update() disk_hpos %f, to hpos %d', disk_hpos / CYCLE_UNIT, tohpos);
		var dr;
		var cycles;

		if (disk_hpos < 0) {
			disk_hpos = -disk_hpos;
			return;
		}
		cycles = (tohpos << 8) - disk_hpos;
		if (cycles <= 0)
			return;

		disk_hpos += cycles;
		if (disk_hpos >= (AMIGA.playfield.maxhpos << 8))
			disk_hpos %= (1 << 8);

		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (floppy[dr].motoroff || !floppy[dr].tracklen || !floppy[dr].trackspeed)
				continue;
			floppy[dr].floppybitcounter += cycles;
			if (selected & (1 << dr)) {
				floppy[dr].mfmpos += Math.floor(floppy[dr].floppybitcounter / floppy[dr].trackspeed);
				floppy[dr].mfmpos %= floppy[dr].tracklen;
				floppy[dr].floppybitcounter %= floppy[dr].trackspeed;
				continue;
			}
			if (floppy[dr].diskfile)
				floppy[dr].fill_bigbuf(0);
			floppy[dr].mfmpos %= floppy[dr].tracklen;
		}
		var didaccess = 0;
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (selected & (1 << dr))
				continue;
			else if (floppy[dr].motoroff || !floppy[dr].trackspeed)
				continue;
			/* write dma and wordsync enabled: read until wordsync match found */
			if (dskdmaen == DSKDMA_WRITE && dma_enable)
				this.update_write(dr, floppy[dr].floppybitcounter);
			else
				this.update_read(dr, floppy[dr].floppybitcounter);

			floppy[dr].floppybitcounter %= floppy[dr].trackspeed;
			didaccess = 1;
		}
		/* no floppy selected but read dma */
		if (!didaccess && dskdmaen == DSKDMA_READ)
			this.update_read_nothing(cycles);

		/* instantly finish dma if dsklen==0 and wordsync detected */
		if (dskdmaen != DSKDMA_OFF && dma_enable && dsklength2 == 0 && dsklength == 0)
			this.dmafinished();

		this.doupdate_predict(disk_hpos);
	};
	
	this.dma_debugmsg = function () {
		BUG.info('Disk.dma_debugmsg() LEN=%04x (%d) SYNC=%04x PT=%08x ADKCON=%04x', dsklength, dsklength, (AMIGA.adkcon & 0x400) ? dsksync : 0xffff, dskpt, AMIGA.adkcon);
	};
	
	this.start = function () {
		fifo_filled = false;
		for (var i = 0; i < 3; i++)
			fifo_inuse[i] = 0;

		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (!(selected & (1 << dr))) {
				if (dskdmaen == DSKDMA_WRITE) {
					floppy[dr].tracklen = LONGWRITEMODE ? FLOPPY_WRITE_MAXLEN : (AMIGA.config.video.ntsc ? 6399 : 6334) * floppy[dr].ddhd * 8 * 2;
					floppy[dr].trackspeed = get_floppy_speed();
					floppy[dr].skipoffset = -1;
					floppy[dr].updatemfmpos();
				}

				var tr = floppy[dr].cyl * 2 + this.side;
				if (floppy[dr].trackdata[tr].type == TRACK_RAW1) {
					floppy[dr].mfmpos = 0;
					bitoffset = 0;
				}
			}
			floppy[dr].floppybitcounter = 0;
		}
		dma_enable = (AMIGA.adkcon & 0x400) ? false : true;
	};

	this.check_change = function () {
		//if (currprefs.floppy_speed != changed_prefs.floppy_speed) currprefs.floppy_speed = changed_prefs.floppy_speed;
		/*for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
		 if (currprefs.floppyslots[i].dfxtype != changed_prefs.floppyslots[i].dfxtype) {
		 currprefs.floppyslots[i].dfxtype = changed_prefs.floppyslots[i].dfxtype;
		 floppy[i].reset();
		 }
		 }*/
	};
	
	this.vsync = function () {
		this.check_change();

		for (var i = 0; i < MAX_FLOPPY_DRIVES; i++) {
			//if (drv->dskchange_time == 0 && _tcscmp (currprefs.floppyslots[i].df, changed_prefs.floppyslots[i].df)) this.insert(i, changed_prefs.floppyslots[i].df);
			floppy[i].vsync();
		}
	};
	
	this.hsync = function () {
		for (var dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (floppy[dr].steplimit)
				floppy[dr].steplimit--;
		}
		if (indexdecay)
			indexdecay--;
		if (linecounter) {
			if (!(--linecounter))
				this.dmafinished();
			return;
		}
		this.update(AMIGA.playfield.maxhpos);
	};
	
	this.update_adkcon = function (v) {
		var vold = AMIGA.adkcon;
		var vnew = AMIGA.adkcon;
		if (v & 0x8000)
			vnew |= v & 0x7FFF;
		else
			vnew &= ~v;

		if ((vnew & 0x400) && !(vold & 0x400))
			bitoffset = 0;
	};
	
	this.motordelay_func = function (unit) {
		//BUG.info('Disk.motordelay_func(%d)', unit);
		floppy[unit].motordelay = false;
	};
	
	this.DSKLEN = function (v, hpos) {
		//BUG.info('Disk.DSKLEN() $%04x', v);
		var dr, prev = dsklen;

		this.update(hpos);

		if ((v & 0x8000) && (dsklen & 0x8000)) {
			dskdmaen = DSKDMA_READ;
			this.start();
		}
		if (!(v & 0x8000)) {
			if (dskdmaen != DSKDMA_OFF) {
				if (dskdmaen == DSKDMA_READ)
					BUG.info('Disk.DSKLEN() warning: Disk read DMA aborted, %d words left', dsklength);
				else if (dskdmaen == DSKDMA_WRITE) {
					BUG.info('Disk.DSKLEN() warning: Disk write DMA aborted, %d words left', dsklength);
					for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
						if (floppy[dr].writtento) floppy[dr].write_data();
					}
				}
				dskdmaen = DSKDMA_OFF;
			}
		}
		dsklen = v;
		dsklength2 = dsklength = dsklen & 0x3fff;

		if (dskdmaen == DSKDMA_OFF)
			return;
		if (dsklength == 0 && dma_enable) {
			this.dmafinished();
			return;
		}
		if ((v & 0x4000) && (prev & 0x4000)) {
			if (dsklength == 0)
				return;
			if (dsklength == 1) {
				this.dmafinished();
				return;
			}
			dskdmaen = DSKDMA_WRITE;
			this.start();
		}

		var motormask = 0;
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			floppy[dr].writtento = 0;
			if (floppy[dr].motoroff)
				continue;
			motormask |= 1 << dr;
			if ((selected & (1 << dr)) == 0)
				break;
		}
		var noselected = dr == 4;

		/* Try to make floppy access from Kickstart faster.  */
		if (dskdmaen != DSKDMA_READ && dskdmaen != DSKDMA_WRITE)
			return;

		/* no turbo mode if any selected drive has non-standard ADF */
		for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
			if (selected & (1 << dr))
				continue;
			if (floppy[dr].filetype != ADF_NORMAL)
				break;
		}
		if (dr < MAX_FLOPPY_DRIVES)
			return;

		{
			var done = false;
			for (dr = 0; dr < MAX_FLOPPY_DRIVES; dr++) {
				var pos, i;

				if (selected & (1 << dr))
					continue;
				else if (floppy[dr].motoroff)
					continue;
				else if (!floppy[dr].useturbo && AMIGA.config.floppy.speed != SAEV_Config_Floppy_Speed_Turbo)
					continue;

				pos = floppy[dr].mfmpos & ~15;
				floppy[dr].fill_bigbuf(0);

				if (dskdmaen == DSKDMA_READ) { //TURBO read
					if (AMIGA.adkcon & 0x400) {
						for (i = 0; i < floppy[dr].tracklen; i += 16) {
							pos += 16;
							pos %= floppy[dr].tracklen;
							if (floppy[dr].bigmfmbuf[pos >> 4] == dsksync) {
								pos += 16;
								pos %= floppy[dr].tracklen;
								break;
							}
						}
						if (i >= floppy[dr].tracklen)
							return;
					}
					while (dsklength-- > 0) {
						AMIGA.mem.store16(dskpt, floppy[dr].bigmfmbuf[pos >> 4]);
						dskpt += 2;
						pos += 16;
						pos %= floppy[dr].tracklen;
					}
					AMIGA.INTREQ(INT_DSKSYN);
					done = true;
				} else if (dskdmaen == DSKDMA_WRITE) { //TURBO write
					for (i = 0; i < dsklength; i++) {
						floppy[dr].bigmfmbuf[pos >> 4] = AMIGA.mem.load16(dskpt + i * 2);
						pos += 16;
						pos %= floppy[dr].tracklen;
					}
					floppy[dr].write_data();
					done = true;
				}
			}
			if (!done && noselected) {
				while (dsklength-- > 0) {
					if (dskdmaen == DSKDMA_WRITE)
						AMIGA.mem.load16(dskpt);
					else
						AMIGA.mem.store16(dskpt, 0);
					dskpt += 2;
				}
				AMIGA.INTREQ(INT_DSKSYN);
				done = true;
			}
			if (done) {
				linecounter = 2;
				dskdmaen = DSKDMA_OFF;
			}
		}
	};
		
	this.DSKBYTR = function (hpos) {
		this.update(hpos);

		var v = dskbytr_val;
		dskbytr_val &= ~0x8000;
		if (word == dsksync && AMIGA.events.cycles_in_range(dsksync_cycles))
			v |= 0x1000;
		if (dskdmaen != DSKDMA_OFF && AMIGA.dmaen(DMAF_DSKEN))
			v |= 0x4000;
		if (dsklen & 0x4000)
			v |= 0x2000;

		//BUG.info('Disk.DSKBYTR() %x', v);
		return v;
	};

	this.DSKSYNC = function (v, hpos) {
		if (v == dsksync)
			return;

		this.update(hpos);
		dsksync = v;
	};

	this.DSKDAT = function (v) {
		if (fifo_inuse[2]) {
			BUG.info('Disk.DSKDAT() FIFO overflow!');
			return;
		}
		fifo_inuse[2] = fifo_inuse[1];
		fifo[2] = fifo[1];
		fifo_inuse[1] = fifo_inuse[0];
		fifo[1] = fifo[0];
		fifo_inuse[0] = dskdmaen == DSKDMA_WRITE ? 2 : 1;
		fifo[0] = v;
		fifo_filled = true;
	};

	this.DSKDATR = function () {
		var i, v = 0;

		for (i = 2; i >= 0; i--) {
			if (fifo_inuse[i]) {
				fifo_inuse[i] = 0;
				v = fifo[i];
				break;
			}
		}
		if (i < 0)
			BUG.info('Disk.DSKDATR() FIFO underflow!');
		else if (dskdmaen > 0 && dskdmaen < 3 && dsklength <= 0 && this.fifostatus() < 0)
			this.dmafinished();

		//BUG.info('Disk.DSKDATR() %x', v);
		return v;
	};

	this.DSKPTH = function (v) {
		dskpt = ((v << 16) | (dskpt & 0xffff)) >>> 0;
	};

	this.DSKPTL = function (v) {
		dskpt = ((dskpt & 0xffff0000) | v) >>> 0;
	};
	
	this.getpt = function () {
		var pt = dskpt;
		dskpt += 2;
		return pt;
	};

	this.dmal = function() {
		var dmal = 0;
		if (dskdmaen != DSKDMA_OFF) {
			if (dskdmaen == DSKDMA_WRITE) {
				dmal = (1 + 2) * (fifo_inuse[0] ? 1 : 0) + (4 + 8) * (fifo_inuse[1] ? 1 : 0) + (16 + 32) * (fifo_inuse[2] ? 1 : 0);
				dmal ^= 63;
				if (dsklength == 2)
					dmal &= ~(16 + 32);
				if (dsklength == 1)
					dmal &= ~(16 + 32 + 4 + 8);
			} else {
				dmal = 16 * (fifo_inuse[0] ? 1 : 0) + 4 * (fifo_inuse[1] ? 1 : 0) + (fifo_inuse[2] ? 1 : 0);
			}
		}
		return dmal;
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Event1() {
	this.active = false;
	this.evtime = 0;
	this.oldcycles = 0;
	this.handler = function(v) {};
}

function Event2() {
	this.active = false;
	this.evtime = 0;
	this.handler = function(v) {};
	this.data = null;
}

function Events() {
	const SYNCBASE = 1000;

	this.eventtab = null;
	this.eventtab2 = null;
	this.currcycle = 0;
	var nextevent = 0;
	var nextevent2 = 0;
		
	var dmal = 0;
	var dmal_hpos = 0;
		
	var vsynctimebase = 0; 
	var vsyncmintime = 0; 
	var vsyncmaxtime = 0;    
	var vsyncwaittime = 0;   
	var vsynctimeperline = 0; 
	var is_syncline = 0;
	var is_syncline_end = 0;
	//var hsync_counter = 0;
	//var vsync_counter = 0;
		
	const MAVG_VSYNC_SIZE = 128;
	var ma_frameskipt = new MAvg(MAVG_VSYNC_SIZE);
	
	const FPSCOUNTER_MAVG_SIZE = 10;
	var fps_mavg = new MAvg(FPSCOUNTER_MAVG_SIZE);
	var idle_mavg = new MAvg(FPSCOUNTER_MAVG_SIZE);
	var timeframes = 0;
	var lastframetime = 0;
	var idletime = 0;
	var frametime = 0;
	var frameskiptime = 0;
	var linecounter = 0;

	var vsync_rendered = false;
	var frame_rendered = false;
	var frame_shown = false;

	var vsyncresume = false;

	/*---------------------------------*/
	
	this.setup = function () {
		if (this.eventtab === null) {
			this.eventtab = new Array(EV_MAX);
			for (var i = 0; i < EV_MAX; i++)
				this.eventtab[i] = new Event1();

			this.eventtab[EV_CIA].handler = function () {
				AMIGA.cia.handler();
			};
			this.eventtab[EV_AUDIO].handler = function () {
				AMIGA.audio.handler();
			};
			this.eventtab[EV_MISC].handler = function () {
				AMIGA.events.misc_handler();
			};
			this.eventtab[EV_HSYNC].handler = function () {
				AMIGA.events.hsync_handler();
			}
		}
		if (this.eventtab2 === null) {
			this.eventtab2 = new Array(EV2_MAX);
			for (var i = 0; i < EV2_MAX; i++)
				this.eventtab2[i] = new Event2();

			this.eventtab2[EV2_BLITTER].handler = function (data) {
				AMIGA.blitter.handler(data);
			};
			this.eventtab2[EV2_DISK].handler = function (data) {
				AMIGA.disk.handler(data);
			};
			this.eventtab2[EV2_DMAL].handler = function (data) {
				AMIGA.events.dmal_handler(data);
			}
		}

		this.calc_vsynctimebase(AMIGA.config.video.ntsc ? 60 : 50);
	};

	this.reset = function () {
		dmal = 0;
		dmal_hpos = 0;

		this.currcycle = 0;
		nextevent = CYCLE_MAX;
		nextevent2 = EV2_MISC;

		vsynctimebase = 0;
		vsyncmintime = 0;
		vsyncmaxtime = 0;
		vsyncwaittime = 0;
		vsynctimeperline = 0;
		is_syncline = 0;
		is_syncline_end = 0;

		this.fpscounter_reset();

		for (var i = 0; i < EV_MAX; i++) {
			this.eventtab[i].active = false;
			this.eventtab[i].evtime = 0;
			this.eventtab[i].oldcycles = 0;
		}
		for (var i = 0; i < EV2_MAX; i++) {
			this.eventtab2[i].active = false;
			this.eventtab2[i].evtime = 0;
		}
		this.eventtab[EV_HSYNC].evtime = 227 * CYCLE_UNIT;
		/* 0xe3 */
		this.eventtab[EV_HSYNC].active = true;

		this.schedule();
	};
	
	this.calc_vsynctimebase = function (hz) {
		vsynctimebase = Math.floor(SYNCBASE / hz);
	};
	
	/*---------------------------------*/   

	this.hpos = function () {
		return Math.floor((this.currcycle - this.eventtab[EV_HSYNC].oldcycles) * CYCLE_UNIT_INV);
	};
	
	this.cycles_in_range = function (endcycles) {
		return (endcycles - this.currcycle > 0);
	};

	/*---------------------------------*/

	this.schedule = function () {
		var mintime = CYCLE_MAX;

		for (var i = 0; i < EV_MAX; i++) {
			if (this.eventtab[i].active) {
				var evtime = this.eventtab[i].evtime - this.currcycle;
				if (evtime < mintime) mintime = evtime;
			}
		}
		nextevent = this.currcycle + mintime;
	};
	
	this.cycle = function (cycles) {
		if (vsyncresume) {
			vsyncresume = false;
			this.hsync_handler_post(1);
		}

		while ((nextevent - this.currcycle) <= cycles) {
			if (is_syncline) {
				var rpt = read_processor_time();
				if (is_syncline > 0) {
					var v = rpt - vsyncmintime;
					var v2 = rpt - is_syncline_end;
					if (v > vsynctimebase || v < -vsynctimebase) v = 0;
					if (v < 0 && v2 < 0) return;
				} else if (is_syncline < 0) {
					var v = rpt - is_syncline_end;
					if (v < 0) return;
				}
				is_syncline = 0;
			}

			cycles -= nextevent - this.currcycle;
			this.currcycle = nextevent;

			for (var i = 0; i < EV_MAX; i++) {
				if (this.eventtab[i].active && this.eventtab[i].evtime == this.currcycle)
					this.eventtab[i].handler(this.eventtab[i].data);
			}
			this.schedule();
		}
		this.currcycle += cycles;
	};

	/*---------------------------------*/
	
	var stack = { recursive:0, dorecheck:false };

	this.misc_handler = function () {
		//if (stack.recursive > 1) BUG.info('misc_handler() recursive %d', stack.recursive);
		var mintime;
		var ct = this.currcycle;

		if (stack.recursive) {
			stack.dorecheck = true;
			return;
		}
		stack.recursive++;
		this.eventtab[EV_MISC].active = false;

		var recheck = true;
		while (recheck) {
			recheck = false;
			mintime = CYCLE_MAX;

			for (var i = 0; i < EV2_MAX; i++) {
				if (this.eventtab2[i].active) {
					if (this.eventtab2[i].evtime == ct) {
						this.eventtab2[i].active = false;
						this.eventtab2[i].handler(this.eventtab2[i].data);

						if (stack.dorecheck || this.eventtab2[i].active) {
							recheck = true;
							stack.dorecheck = false;
						}
					} else {
						var eventtime = this.eventtab2[i].evtime - ct;
						if (eventtime < mintime)
							mintime = eventtime;
					}
				}
			}
		}
		if (mintime != CYCLE_MAX) {
			this.eventtab[EV_MISC].active = true;
			this.eventtab[EV_MISC].oldcycles = ct;
			this.eventtab[EV_MISC].evtime = ct + mintime;
			this.schedule();
		}
		stack.recursive--;
	};

	this.newevent2_x = function (t, data, func) {
		var et = this.currcycle + t;
		var no = nextevent2;
		for (; ;) {
			if (!this.eventtab2[no].active)
				break;

			no++;
			if (no == EV2_MAX)
				no = EV2_MISC;
			if (no == nextevent2) {
				BUG.info('newevent2_x() out of events!');
				return;
			}
		}
		nextevent2 = no;

		this.eventtab2[no].active = true;
		this.eventtab2[no].evtime = et;
		this.eventtab2[no].handler = func;
		this.eventtab2[no].data = data;
		this.misc_handler();
	};

	this.newevent2 = function (t, data, func) {
		if (t <= 0)
			func(data);
		else
			this.newevent2_x(t * CYCLE_UNIT, data, func);
	};

	this.newevent = function (id, t, data) {
		this.eventtab2[id].active = true;
		this.eventtab2[id].evtime = this.currcycle + t * CYCLE_UNIT;
		this.eventtab2[id].data = data;
		this.misc_handler();
	};

	this.remevent = function (no) {
		if (this.eventtab2[no].active) {
			this.eventtab2[no].active = false;
			//BUG.info('remevent() %d', no);
		}
	};
	
	/*---------------------------------*/
	
	this.dmal_emu = function (v) {
		if (!(AMIGA.dmacon & DMAF_DMAEN))
			return;

		//var hpos = this.hpos();
		var dat, pt;
		if (v >= 6) {
			v -= 6;
			var nr = v >> 1;
			pt = AMIGA.audio.getpt(nr, (v & 1) != 0);
			//var dat = AMIGA.mem.load16_chip(pt);
			dat = AMIGA.mem.chip.data[pt >>> 1];
			AMIGA.custom.last_value = dat;
			AMIGA.audio.AUDxDAT(nr, dat);
		} else {
			var w = v & 1;
			pt = AMIGA.disk.getpt();
			if (w) {
				if (AMIGA.disk.fifostatus() <= 0) {
					//var dat = AMIGA.mem.load16_chip(pt);
					dat = AMIGA.mem.chip.data[pt >>> 1];
					AMIGA.custom.last_value = dat;
					AMIGA.disk.DSKDAT(dat);
				}
			} else {
				if (AMIGA.disk.fifostatus() >= 0) {
					dat = AMIGA.disk.DSKDATR();
					//AMIGA.mem.store16_chip(pt, dat);
					AMIGA.mem.chip.data[pt >>> 1] = dat;
				}
			}
		}
	};

	this.dmal_handler = function (v) {
		while (dmal) {
			if (dmal & 3)
				this.dmal_emu(dmal_hpos + ((dmal & 2) ? 1 : 0));
			dmal_hpos += 2;
			dmal >>>= 2;
		}
		this.remevent(EV2_DMAL);
	};
	
	this.dmal_hsync = function () {
		if (dmal) BUG.info('dmal_hsync() DMAL error!? %04x', dmal);
		dmal = AMIGA.audio.dmal();
		dmal <<= 6;
		dmal |= AMIGA.disk.dmal();
		if (dmal) {
			dmal_hpos = 0;
			this.newevent(EV2_DMAL, 7, 13);
		}
	};

	/*---------------------------------*/
	
	function sleep(ms) {
		var start = new Date().getTime();
		while ((new Date().getTime() - start) < ms) {}
	}

	function read_processor_time() {
		return (new Date().getTime()); 
		//return window.performance.now(); 
		//return window.performance.webkitNow(); 
	}

	function rpt_vsync(adjust) {
		var curr_time = read_processor_time();
		var v = curr_time - vsyncwaittime + adjust;
		if (v > SYNCBASE || v < -SYNCBASE) {
			vsyncmintime = vsyncmaxtime = vsyncwaittime = curr_time;
			v = 0;
		}
		return v;
	}

	this.framewait = function () {
		var clockadjust = 0;
		var curr_time;

		var frameskipt_avg = ma_frameskipt.set(frameskiptime);
		frameskiptime = 0;

		is_syncline = 0;

		if (AMIGA.config.cpu.speed < 0) {
			if (!frame_rendered)
				frame_rendered = AMIGA.playfield.render_screen(false);

			curr_time = read_processor_time();

			var adjust = 0;
			if (Math.floor(curr_time - vsyncwaittime) > 0 && Math.floor(curr_time - vsyncwaittime) < (vsynctimebase >> 1))
				adjust += curr_time - vsyncwaittime;
			adjust += clockadjust;

			//console.log(adjust);

			vsyncwaittime = curr_time + vsynctimebase - adjust;
			vsyncmintime = curr_time;

			var max = Math.floor(vsynctimebase - adjust);
			if (max < 0) {
				max = 0;
				vsynctimeperline = 1;
			} else
				vsynctimeperline = Math.floor(max / (AMIGA.playfield.maxvpos_nom + 1));

			vsyncmaxtime = curr_time + max;
		} else {
			var start;
			var t = 0;

			if (!frame_rendered) {
				start = read_processor_time();
				frame_rendered = AMIGA.playfield.render_screen(false);
				t = read_processor_time() - start;
			}
			while (rpt_vsync(clockadjust) < -4)// / (SYNCBASE / 1000.0);
				sleep(2);

			start = read_processor_time();
			while (rpt_vsync(clockadjust) < 0) {
			}
			idletime += read_processor_time() - start;

			curr_time = read_processor_time();
			vsyncmintime = curr_time;
			vsyncmaxtime = vsyncwaittime = curr_time + vsynctimebase;
			if (frame_rendered) {
				frame_shown = AMIGA.playfield.show_screen();
				t += read_processor_time() - curr_time;
			}
			t += frameskipt_avg;

			vsynctimeperline = Math.floor((vsynctimebase - t) / 3);
			if (vsynctimeperline < 0)
				vsynctimeperline = 0;
			else if (vsynctimeperline > Math.floor(vsynctimebase / 3))
				vsynctimeperline = Math.floor(vsynctimebase / 3);
		}
	};

	this.framewait2 = function () {
		if (AMIGA.config.cpu.speed < 0) {
			if (AMIGA.playfield.is_last_line()) {
				/* really last line, just run the cpu emulation until whole vsync time has been used */
				vsyncmintime = vsyncmaxtime;
				/* emulate if still time left */
				is_syncline_end = read_processor_time() + vsynctimebase;
				/* far enough in future, we never wait that long */
				is_syncline = 1;
			} else {
				/* end of scanline, run cpu emulation as long as we still have time */
				vsyncmintime += vsynctimeperline;
				linecounter++;
				is_syncline = 0;
				if (Math.floor(vsyncmaxtime - vsyncmintime) > 0) {
					if (Math.floor(vsyncwaittime - vsyncmintime) > 0) {
						var rpt = read_processor_time();
						/* Extra time left? Do some extra CPU emulation */
						if (Math.floor(vsyncmintime - rpt) > 0) {
							is_syncline = 1;
							/* limit extra time */
							is_syncline_end = rpt + vsynctimeperline;
							linecounter = 0;
						}
					}
					// extra cpu emulation time if previous 10 lines without extra time.
					if (!is_syncline && linecounter >= 10) {
						is_syncline = -1;
						is_syncline_end = read_processor_time() + vsynctimeperline;
						linecounter = 0;
					}
				}
			}
		} else {
			if (AMIGA.playfield.vpos + 1 < AMIGA.playfield.maxvpos + AMIGA.playfield.lof_store && (AMIGA.playfield.vpos == Math.floor(AMIGA.playfield.maxvpos_nom / 3) || AMIGA.playfield.vpos == Math.floor(AMIGA.playfield.maxvpos_nom * 2 / 3))) {
				vsyncmintime += vsynctimeperline;
				var rpt = read_processor_time();
				// sleep if more than 2ms "free" time
				while (Math.floor(vsyncmintime) - Math.floor(rpt + vsynctimebase / 10) > 0 && Math.floor(vsyncmintime - rpt) < vsynctimebase) {
					sleep(1);
					rpt = read_processor_time();
					//console.log('*');
				}
			}
		}
	};
	
	this.fpscounter_reset = function () {
		timeframes = 0;
		fps_mavg.clr();
		idle_mavg.clr();
		lastframetime = read_processor_time();
		idletime = 0;
	};

	this.fpscounter = function () {
		var hz = AMIGA.playfield.vblank_hz;

		var now = read_processor_time();
		var last = now - lastframetime;
		lastframetime = now;

		if (AMIGA.config.video.framerate > 1) {
			last <<= 1;
			hz /= 2;
		}

		fps_mavg.set(last / 10);
		idle_mavg.set(idletime / 10);
		idletime = 0;

		frametime += last;
		timeframes++;

		if ((timeframes & 7) == 0) {
			var idle = 1000 - (idle_mavg.average == 0 ? 0.0 : idle_mavg.average * 1000.0 / vsynctimebase);
			var fps = fps_mavg.average == 0 ? 0 : SYNCBASE * 10 / fps_mavg.average;
			if (fps > 9999) fps = 9999;
			if (idle < 0) idle = 0;
			if (idle > 100 * 10) idle = 100 * 10;
			if (hz * 10 > fps) idle *= (hz * 10 / fps);

			if ((timeframes & 15) == 0) {
				AMIGA.config.hooks.fps(Math.round(fps * 0.1));
				AMIGA.config.hooks.cpu(Math.round(idle * 0.1));
			}
		}
	};
	         
	/*---------------------------------*/

	this.hsync_handler_pre = function (onvsync) {
		//var hpos = this.hpos();
		AMIGA.copper.sync_copper_with_cpu(AMIGA.playfield.maxhpos, 0);
		AMIGA.playfield.hsync_handler_pre();
		AMIGA.disk.hsync();
		if (AMIGA.config.audio.enabled)
			AMIGA.audio.hsync();
		//AMIGA.cia.hsync_prehandler(); //empty
		//hsync_counter++;
		AMIGA.playfield.hsync_handler_pre_next_vpos(onvsync);

		this.eventtab[EV_HSYNC].evtime = this.currcycle + AMIGA.playfield.maxhpos * CYCLE_UNIT;
		this.eventtab[EV_HSYNC].oldcycles = this.currcycle;
	};

	this.vsync_handler_pre = function () {
		//AMIGA.audio.vsync(); //empty
		AMIGA.cia.vsync_prehandler();

		if (!vsync_rendered) {
			var start = read_processor_time();
			AMIGA.playfield.vsync_handle_redraw();
			frameskiptime += read_processor_time() - start;
			//vsync_rendered = true;
		}
		this.framewait();
		if (!frame_rendered)
			frame_rendered = AMIGA.playfield.render_screen(false);
		if (frame_rendered && !frame_shown)
			//frame_shown = AMIGA.playfield.show_screen();
			AMIGA.playfield.show_screen();

		this.fpscounter();
		vsync_rendered = false;
		frame_shown = false;
		frame_rendered = false;

		AMIGA.playfield.checklacecount(null);
	};
	
	var cia_hsync = 256;
	this.hsync_handler_post = function (onvsync) {
		AMIGA.copper.last_copper_hpos = 0;

		var ciasyncs = !(AMIGA.playfield.bplcon0 & 2) || ((AMIGA.playfield.bplcon0 & 2) && AMIGA.config.chipset.genlock);
		AMIGA.cia.hsync_posthandler(ciasyncs);
		if (AMIGA.config.cia.tod > 0) {
			cia_hsync -= 256;
			if (cia_hsync <= 0) {
				AMIGA.cia.vsync_posthandler(1);
				cia_hsync += Math.floor((MAXVPOS_PAL * MAXHPOS_PAL * 50 * 256) / (AMIGA.playfield.maxhpos * (AMIGA.config.cia.tod == 2 ? 60 : 50)));
			}
		} else if (AMIGA.config.cia.tod == 0 && onvsync)
			AMIGA.cia.vsync_posthandler(ciasyncs);

		AMIGA.playfield.hsync_handler_post();
		AMIGA.custom.last_value = 0xffff;

		if (!AMIGA.config.blitter.immediate && AMIGA.blitter.getState() != BLT_done && AMIGA.dmaen(DMAF_BPLEN) && AMIGA.playfield.getDiwstate() == DIW_WAITING_STOP)
			AMIGA.blitter.slowdown();

		if (onvsync) {
			// vpos_count >= MAXVPOS just to not crash if VPOSW writes prevent vsync completely
			/*if ((AMIGA.playfield.bplcon0 & 8) && !lightpen_triggered) {
			 vpos_lpen = AMIGA.playfield.vpos - 1;
			 hpos_lpen = AMIGA.playfield.maxhpos;
			 lightpen_triggered = 1;
			 }*/
			AMIGA.playfield.vpos = 0;
			this.vsync_handler_post();
			AMIGA.playfield.vpos_count = 0;
		}
		if (AMIGA.config.chipset.agnus_dip) {
			if (AMIGA.playfield.vpos == 1)
				AMIGA.INTREQ_0(INT_VERTB);
		} else {
			if (AMIGA.playfield.vpos == 0)
				AMIGA.INTREQ_0(INT_VERTB);
		}
		this.dmal_hsync();
		this.framewait2();
		AMIGA.playfield.hsync_handler_post_nextline_how();
		AMIGA.copper.reset2();

		if (CUSTOM_SIMPLE)
			AMIGA.playfield.do_sprites(0);

		//AMIGA.copper.check(2);
		AMIGA.playfield.hsync_handler_post_diw_change();
	};
	
	this.vsync_handler_post = function () {
		//if ((AMIGA.intreq & 0x0020) && (AMIGA.intena & 0x0020)) BUG.info('vblank interrupt not cleared');
		AMIGA.disk.vsync();
		AMIGA.playfield.vsync_handler_post();
	};
	
	this.hsync_handler = function() {
		var vs = AMIGA.playfield.is_custom_vsync();
		this.hsync_handler_pre(vs);
		if (vs) {
			this.vsync_handler_pre();

			//vsyncresume = true; throw new VSync(0, 'vsync');
			
			AMIGA.state = ST_IDLE;
		}
		this.hsync_handler_post(vs);
	}	
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Board_A2058() {
	const MEM_8MB		= 0x00;
	const MEM_4MB		= 0x07;
	const MEM_2MB		= 0x06;
	const MEM_1MB		= 0x05;
	const MEM_512KB	= 0x04;
	//const MEM_256KB	= 0x03;
	//const MEM_128KB	= 0x02;
	//const MEM_64KB		= 0x01;
 
	//const SAME_SLOT	= 0x08; /* Next card is in the same Slot  */
	//const ROM_CARD		= 0x10; /* Card has valid ROM */
	const ADD_MEMORY	= 0x20; /* Add Memory to List of Free Ram */

	const ZORRO2		= 0xc0; /* Type of Expansion Card */
	//const ZORRO3		= 0x80;

	const CARE_ADDR	= 0x80; /* Adress HAS to be $200000-$9fffff */

	const VENDOR_COMMODORE	= 514;
	const PRODUCT_A2058		= 10;

	this.info = function() {
		//BUG.info('Board_A2058.info()');
		var type;
		switch (AMIGA.mem.fast.size) {
			case 0x080000: type = ZORRO2 + ADD_MEMORY + MEM_512KB; break;
			case 0x100000: type = ZORRO2 + ADD_MEMORY + MEM_1MB; break;
			case 0x200000: type = ZORRO2 + ADD_MEMORY + MEM_2MB; break;
			case 0x400000: type = ZORRO2 + ADD_MEMORY + MEM_4MB; break;
			case 0x800000: type = ZORRO2 + ADD_MEMORY + MEM_8MB; break;
		}
		return {
			name:'Commodore A2058',   
			vendor:VENDOR_COMMODORE, 
			product:PRODUCT_A2058,
			serial:1,			
			type:type,   
			flags:CARE_ADDR,  
			rom:0,			
			ctrl:0			
		};			
	}
}

function Board_Dummy() {
	this.info = function() {
		//BUG.info('Board_Dummy.info()');
		return {
			name:null,
			vendor:0, 
			product:0,
			serial:0,
			type:0,   
			flags:0,  
			rom:0,			
			ctrl:0			
		};			
	}
}

function Expansion() {
	const MAX_EXPANSION_BOARDS	= 5;

	var mem = {
		data:null,
		lo:0,
		hi:0
	};		
	var boards = [];
	var board = 0;

	this.setup = function () {
		mem.data = new Uint16Array(0x8000);
		boards = [];
		if (AMIGA.mem.fast.size > 0)
			boards[0] = new Board_A2058();
		else
			boards[0] = new Board_Dummy();

		for (var i = 1; i < MAX_EXPANSION_BOARDS; i++)
			boards[i] = new Board_Dummy();
	};
	
	this.reset = function () {
		board = 0;
		this.config(board);
	};
	
	this.clear = function () {
		for (var i = 0; i < mem.data.length; i++)
			mem.data[i] = 0;
	};
	
	this.write = function (addr, value) {
		mem.data[(addr >> 1)] = (value & 0xf0) << 8;
		mem.data[(addr >> 1) + 1] = (value & 0x0f) << 12;
	};

	this.load8 = function (addr) {
		addr &= 0xffff;
		var value = (mem.data[addr >>> 1] >> ((addr & 1) ? 0 : 8)) & 0xff;
		if (addr == 0 || addr == 2 || addr == 0x40 || addr == 0x42)
			return value;
		return ~value & 0xff;
	};

	this.store8 = function (addr, value) {
		switch (addr & 0xff) {
			case 0x30:
			case 0x32:
				mem.hi = 0;
				mem.lo = 0;
				this.write(0x48, 0x00);
				break;

			case 0x48:
				mem.hi = value;
				//BUG.info('Expansion.store8() board %d done.', board + 1);
				++board;
				if (board <= MAX_EXPANSION_BOARDS)
					this.config(board);
				else
					this.clear();
				break;

			case 0x4a:
				mem.lo = value;
				break;

			case 0x4c:
				//BUG.info('Expansion.store8() board %d faild.', board + 1);
				++board;
				if (board <= MAX_EXPANSION_BOARDS)
					this.config(board);
				else
					this.clear();
				break;
		}
	};
	
	this.config = function(board) {
		var info = boards[board].info();
		
		this.clear();
		if (info.name) {
			BUG.info('Expansion.config() Added \'%s\' into slot %d', info.name, board + 1);
			
			this.write(0x00, info.type); 
			this.write(0x08, info.flags);

			this.write(0x04, info.product);
			this.write(0x10, info.vendor >> 8);
			this.write(0x14, info.vendor & 0x0f);

			this.write(0x18, (info.serial >> 24) & 0xff); 
			this.write(0x1c, (info.serial >> 16) & 0xff);
			this.write(0x20, (info.serial >> 8) & 0xff);
			this.write(0x24, info.serial & 0xff);

			this.write(0x28, (info.rom >> 8) & 0xff);
			this.write(0x2c, info.rom & 0xff); 

			this.write(0x40, info.ctrl);
		}
	}	
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Mouse() {
	this.button = [false, false, false];
	this.pos = 0;

	var cx = 0;
	var cy = 0;
	var mx = 0;
	var my = 0;
	var lx = -1;
	var ly = -1;

	this.reset = function () {
		this.button = [0, 0, 0];
		cx = cy = 0;
		lx = ly = -1;
	};

	this.mousedown = function (e) {
		e = e || window.event;
		if (!e) return;

		this.button[e.button] = true;
	};

	this.mouseup = function (e) {
		e = e || window.event;
		if (!e) return;

		this.button[e.button] = false;
	};

	this.mouseover = function (e) {
		//AMIGA.video.hideCursor(1);
		this.mousemove(e);
		lx = cx;
		ly = cy;
	};

	this.mouseout = function (e) {
		//AMIGA.video.hideCursor(0);
		this.mouseup(e);
	};

	this.mousemove = function (e) {
		e = e || window.event;
		if (!e || !AMIGA.video) return;

		if (e.pageX || e.pageY) {
			cx = e.pageX;
			cy = e.pageY;
		} else if (e.clientX || e.clientY) {
			cx = e.clientX;
			cy = e.clientY;
		}
		if (lx == -1) {
			lx = cx;
			ly = cy;
		}
		//BUG.info('USER() mousemove %d %d', cx, cy);
	};

	this.update = function() {
		if (lx != -1) {
			var dx = cx - lx;
			var dy = cy - ly;

			if (dx > 127) dx = 127; else if (dx < -127) dx = -127;
			mx += dx;
			if (mx > 255) mx -= 256; else if (mx < 0) mx += 256;

			if (dy > 127) dy = 127; else if (dy < -127) dy = -127;
			my += dy;
			if (my > 255) my -= 256; else if (my < 0) my += 256;
		} else 
			mx = my = 0;
			
		lx = cx;
		ly = cy;
	
		this.pos = (my << 8) + mx;
		//BUG.info('USER() mousemove %d %d, ps $%04x', mx, my, this.pos);
	}
}

function Joystick(type) {
	this.type = type;
	this.button = [false, false, false];
	this.state = [false, false, false, false];
	this.dir = 0;

	this.reset = function () {
		this.button = [false, false, false];
		this.state = [false, false, false, false];
	};

	this.update = function() {
		var u = this.state[1];
		var d = this.state[3];

		if (this.state[0]) u = !u;
		if (this.state[2]) d = !d;

		this.dir = d | (this.state[2] << 1) | (u << 8) | (this.state[0] << 9);
		
		/*var l = 1, r = 1, u = 1, d = 1;

		if (this.state[0]) l = 0;
		if (this.state[1]) u = 0;
		if (this.state[2]) r = 0;
		if (this.state[3]) d = 0;

		var b0 = (d ^ r) ? 1 : 0;
		var b1 = (r ^ 1) ? 2 : 0;
		var b8 = (u ^ l) ? 1 : 0;
		var b9 = (l ^ 1) ? 2 : 0;
		
		this.dir = ((b8 | b9) << 8) | (b0 | b1);*/
	}
}

function Keyboard() {
	const RAWKEY_TILDE             = 0x00;
	const RAWKEY_1                 = 0x01;
	const RAWKEY_2                 = 0x02;
	const RAWKEY_3                 = 0x03;
	const RAWKEY_4                 = 0x04;
	const RAWKEY_5                 = 0x05;
	const RAWKEY_6                 = 0x06;
	const RAWKEY_7                 = 0x07;
	const RAWKEY_8                 = 0x08;
	const RAWKEY_9                 = 0x09;
	const RAWKEY_0                 = 0x0A;
	const RAWKEY_MINUS             = 0x0B;
	const RAWKEY_EQUAL             = 0x0C;
	//const RAWKEY_BACKSLASH         = 0x0D;
	const RAWKEY_KP_0              = 0x0F;
	const RAWKEY_Q                 = 0x10;
	const RAWKEY_W                 = 0x11;
	const RAWKEY_E                 = 0x12;
	const RAWKEY_R                 = 0x13;
	const RAWKEY_T                 = 0x14;
	const RAWKEY_Y                 = 0x15;
	const RAWKEY_U                 = 0x16;
	const RAWKEY_I                 = 0x17;
	const RAWKEY_O                 = 0x18;
	const RAWKEY_P                 = 0x19;
	const RAWKEY_LBRACKET          = 0x1A;
	const RAWKEY_RBRACKET          = 0x1B;
	const RAWKEY_KP_1              = 0x1D;
	const RAWKEY_KP_2              = 0x1E;
	const RAWKEY_KP_3              = 0x1F;
	const RAWKEY_A                 = 0x20;
	const RAWKEY_S                 = 0x21;
	const RAWKEY_D                 = 0x22;
	const RAWKEY_F                 = 0x23;
	const RAWKEY_G                 = 0x24;
	const RAWKEY_H                 = 0x25;
	const RAWKEY_J                 = 0x26;
	const RAWKEY_K                 = 0x27;
	const RAWKEY_L                 = 0x28;
	const RAWKEY_SEMICOLON         = 0x29;
	const RAWKEY_QUOTE             = 0x2A;
	const RAWKEY_2B                = 0x2B;
	const RAWKEY_KP_4              = 0x2D;
	const RAWKEY_KP_5              = 0x2E;
	const RAWKEY_KP_6              = 0x2F;
	const RAWKEY_LESSGREATER       = 0x30;
	const RAWKEY_Z                 = 0x31;
	const RAWKEY_X                 = 0x32;
	const RAWKEY_C                 = 0x33;
	const RAWKEY_V                 = 0x34;
	const RAWKEY_B                 = 0x35;
	const RAWKEY_N                 = 0x36;
	const RAWKEY_M                 = 0x37;
	const RAWKEY_COMMA             = 0x38;
	const RAWKEY_PERIOD            = 0x39;
	const RAWKEY_SLASH             = 0x3A;
	const RAWKEY_KP_DECIMAL        = 0x3C;
	const RAWKEY_KP_7              = 0x3D;
	const RAWKEY_KP_8              = 0x3E;
	const RAWKEY_KP_9              = 0x3F;
	const RAWKEY_SPACE             = 0x40;
	const RAWKEY_BACKSPACE         = 0x41;
	const RAWKEY_TAB               = 0x42;
	//const RAWKEY_KP_ENTER          = 0x43;
	const RAWKEY_RETURN            = 0x44;
	const RAWKEY_ESCAPE            = 0x45;
	const RAWKEY_DELETE            = 0x46;
	//const RAWKEY_INSERT            = 0x47;
	//const RAWKEY_PAGEUP            = 0x48;
	//const RAWKEY_PAGEDOWN          = 0x49;
	const RAWKEY_KP_MINUS          = 0x4A;
	//const RAWKEY_F11               = 0x4B;
	const RAWKEY_UP                = 0x4C;
	const RAWKEY_DOWN              = 0x4D;
	const RAWKEY_RIGHT             = 0x4E;
	const RAWKEY_LEFT              = 0x4F;
	const RAWKEY_F1                = 0x50;
	const RAWKEY_F2                = 0x51;
	const RAWKEY_F3                = 0x52;
	const RAWKEY_F4                = 0x53;
	const RAWKEY_F5                = 0x54;
	const RAWKEY_F6                = 0x55;
	const RAWKEY_F7                = 0x56;
	const RAWKEY_F8                = 0x57;
	const RAWKEY_F9                = 0x58;
	const RAWKEY_F10               = 0x59;
	const RAWKEY_KP_DIVIDE         = 0x5C;
	const RAWKEY_KP_MULTIPLY       = 0x5D;
	const RAWKEY_KP_PLUS           = 0x5E;
	const RAWKEY_HELP              = 0x5F;
	const RAWKEY_LSHIFT            = 0x60;
	const RAWKEY_RSHIFT            = 0x61;
	const RAWKEY_CAPSLOCK          = 0x62;
	const RAWKEY_CONTROL           = 0x63;
	const RAWKEY_LALT              = 0x64;
	//const RAWKEY_RALT              = 0x65;
	const RAWKEY_LAMIGA            = 0x66;
	const RAWKEY_RAMIGA            = 0x67;
	/*const RAWKEY_SCRLOCK           = 0x6B;
	const RAWKEY_PRTSCREEN         = 0x6C;
	const RAWKEY_NUMLOCK           = 0x6D;
	const RAWKEY_PAUSE             = 0x6E;
	const RAWKEY_F12               = 0x6F;
	const RAWKEY_HOME              = 0x70;
	const RAWKEY_END               = 0x71;
	const RAWKEY_MEDIA1            = 0x72;
	const RAWKEY_MEDIA2            = 0x73;
	const RAWKEY_MEDIA3            = 0x74;
	const RAWKEY_MEDIA4            = 0x75;
	const RAWKEY_MEDIA5            = 0x76;
	const RAWKEY_MEDIA6            = 0x77;
	const RAWKEY_NM_WHEEL_UP       = 0x7A;
	const RAWKEY_NM_WHEEL_DOWN     = 0x7B;
	const RAWKEY_NM_WHEEL_LEFT     = 0x7C;
	const RAWKEY_NM_WHEEL_RIGHT    = 0x7D;
	const RAWKEY_NM_BUTTON_FOURTH  = 0x7E;*/	
 	/*const RAWKEY_BAD_CODE			= 0xF9;
 	const RAWKEY_BUFFER_OVERFLOW	= 0xFA;
 	const RAWKEY_SELFTEST_FAILED	= 0xFC;*/
 	const RAWKEY_INIT_POWER_UP		= 0xFD;
 	const RAWKEY_TERM_POWER_UP		= 0xFE;

	const defKeyCodeMap = {
			8:RAWKEY_BACKSPACE, //backspace	
			9:RAWKEY_TAB, //tab	 		
		  13:RAWKEY_RETURN, //enter	 		
		  16:RAWKEY_LSHIFT, //shift	 		
		  17:RAWKEY_CONTROL, //ctrl	 		
		  18:RAWKEY_LALT, //alt	 		
		  //19:RAWKEY_PAUSE, //pause/break	
		  20:RAWKEY_CAPSLOCK, //caps lock	
		  27:RAWKEY_ESCAPE, //escape	 	
		  32:RAWKEY_SPACE, //space	 	
		  //33:RAWKEY_PAGEUP, //page up	 	
		  //34:RAWKEY_PAGEDOWN, //page down	
		  //35:RAWKEY_END, //end	 		
		  //36:RAWKEY_HOME, //home	 		
		  37:RAWKEY_LEFT, //left arrow	
		  38:RAWKEY_UP, //up arrow	 	
		  39:RAWKEY_RIGHT, //right arrow	
		  40:RAWKEY_DOWN, //down arrow	
		  //45:RAWKEY_INSERT, //insert	 	
		  46:RAWKEY_DELETE, //delete	 	
		  48:RAWKEY_0, //0
		  49:RAWKEY_1, //1
		  50:RAWKEY_2, //2
		  51:RAWKEY_3, //3
		  52:RAWKEY_4, //4
		  53:RAWKEY_5, //5
		  54:RAWKEY_6, //6
		  55:RAWKEY_7, //7
		  56:RAWKEY_8, //8
		  57:RAWKEY_9, //9
		  65:RAWKEY_A, //a
		  66:RAWKEY_B, //b
		  67:RAWKEY_C, //c
		  68:RAWKEY_D, //d
		  69:RAWKEY_E, //e
		  70:RAWKEY_F, //f
		  71:RAWKEY_G, //g
		  72:RAWKEY_H, //h
		  73:RAWKEY_I, //i
		  74:RAWKEY_J, //j
		  75:RAWKEY_K, //k
		  76:RAWKEY_L, //l
		  77:RAWKEY_M, //m
		  78:RAWKEY_N, //n
		  79:RAWKEY_O, //o
		  80:RAWKEY_P, //p
		  81:RAWKEY_Q, //q
		  82:RAWKEY_R, //r
		  83:RAWKEY_S, //s
		  84:RAWKEY_T, //t
		  85:RAWKEY_U, //u
		  86:RAWKEY_V, //v
		  87:RAWKEY_W, //w
		  88:RAWKEY_X, //x
		  89:RAWKEY_Z, //y
		  90:RAWKEY_Y, //z
		  91:RAWKEY_LAMIGA, //left window key	
		  92:RAWKEY_RAMIGA, //right window key
		  93:RAWKEY_HELP, //select key	 		
		  96:RAWKEY_KP_0, //numpad 0	 			
		  97:RAWKEY_KP_1, //numpad 1	 			
		  98:RAWKEY_KP_2, //numpad 2	 			
		  99:RAWKEY_KP_3, //numpad 3	 			
		 100:RAWKEY_KP_4, //numpad 4	 			
		 101:RAWKEY_KP_5, //numpad 5	 			
		 102:RAWKEY_KP_6, //numpad 6	 			
		 103:RAWKEY_KP_7, //numpad 7	 			
		 104:RAWKEY_KP_8, //numpad 8	 			
		 105:RAWKEY_KP_9, //numpad 9	 			
		 106:RAWKEY_KP_MULTIPLY, //multiply	 			
		 107:RAWKEY_KP_PLUS, //add	 				
		 109:RAWKEY_KP_MINUS, //subtract	 			
		 110:RAWKEY_KP_DECIMAL, //decimal point	 
		 111:RAWKEY_KP_DIVIDE, //divide	 			
		 112:RAWKEY_F1	, //f1	 					
		 113:RAWKEY_F2	, //f2	 					
		 114:RAWKEY_F3	, //f3	 					
		 115:RAWKEY_F4	, //f4	 					
		 116:RAWKEY_F5	, //f5	 					
		 117:RAWKEY_F6	, //f6	 					
		 118:RAWKEY_F7	, //f7	 					
		 119:RAWKEY_F8	, //f8	 					
		 120:RAWKEY_F9	, //f9	 					
		 121:RAWKEY_F10, //f10	 				
		 //122:RAWKEY_F11, //f11	 				
		 //123:RAWKEY_F12, //f12	 				
		 //144:RAWKEY_NUMLOCK, //num lock	 			
		 //145:RAWKEY_SCRLOCK, //scroll lock	 		
		 /*186:RAWKEY_SEMICOLON, //semi-colon
		 187:RAWKEY_EQUAL, //equal sign	 		
		 188:RAWKEY_COMMA, //comma	 				
		 189:RAWKEY_MINUS, //dash	 				
		 190:RAWKEY_PERIOD, //period	 			
		 191:RAWKEY_SLASH, //forward slash	 
		 192:RAWKEY_TILDE, //grave accent	 
		 219:RAWKEY_LBRACKET, //open bracket	 
		 220:RAWKEY_BACKSLASH, //back slash	 		
		 221:RAWKEY_RBRACKET, //close braket	 
		 222:RAWKEY_QUOTE, //single quote 
		 226:RAWKEY_LESSGREATER*/  
		 186:RAWKEY_LBRACKET, 		
		 187:RAWKEY_RBRACKET,
		 188:RAWKEY_COMMA,	 				
		 189:RAWKEY_SLASH,
		 190:RAWKEY_PERIOD,	 			
		 191:RAWKEY_2B,	 
		 192:RAWKEY_SEMICOLON, 	 
		 219:RAWKEY_MINUS,	 
		 220:RAWKEY_TILDE,	 		
		 221:RAWKEY_EQUAL,	 
		 222:RAWKEY_QUOTE,
		 226:RAWKEY_LESSGREATER                       
	};	
	const mozKeyCodeMap = {
			8:RAWKEY_BACKSPACE, //backspace	
			9:RAWKEY_TAB, //tab	 		
		  13:RAWKEY_RETURN, //enter	 		
		  16:RAWKEY_LSHIFT, //shift	 		
		  17:RAWKEY_CONTROL, //ctrl	 		
		  18:RAWKEY_LALT, //alt	 		
		  //19:RAWKEY_PAUSE, //pause/break	
		  20:RAWKEY_CAPSLOCK, //caps lock	
		  27:RAWKEY_ESCAPE, //escape	 	
		  32:RAWKEY_SPACE, //space	 	
		  //33:RAWKEY_PAGEUP, //page up	 	
		  //34:RAWKEY_PAGEDOWN, //page down	
		  //35:RAWKEY_END, //end	 		
		  //36:RAWKEY_HOME, //home	 		
		  37:RAWKEY_LEFT, //left arrow	
		  38:RAWKEY_UP, //up arrow	 	
		  39:RAWKEY_RIGHT, //right arrow	
		  40:RAWKEY_DOWN, //down arrow	
		  //45:RAWKEY_INSERT, //insert	 	
		  46:RAWKEY_DELETE, //delete	 	
		  48:RAWKEY_0, //0
		  49:RAWKEY_1, //1
		  50:RAWKEY_2, //2
		  51:RAWKEY_3, //3
		  52:RAWKEY_4, //4
		  53:RAWKEY_5, //5
		  54:RAWKEY_6, //6
		  55:RAWKEY_7, //7
		  56:RAWKEY_8, //8
		  57:RAWKEY_9, //9        
		  60:RAWKEY_LESSGREATER,
		  63:RAWKEY_MINUS,       
		  65:RAWKEY_A, //a
		  66:RAWKEY_B, //b
		  67:RAWKEY_C, //c
		  68:RAWKEY_D, //d
		  69:RAWKEY_E, //e
		  70:RAWKEY_F, //f
		  71:RAWKEY_G, //g
		  72:RAWKEY_H, //h
		  73:RAWKEY_I, //i
		  74:RAWKEY_J, //j
		  75:RAWKEY_K, //k
		  76:RAWKEY_L, //l
		  77:RAWKEY_M, //m
		  78:RAWKEY_N, //n
		  79:RAWKEY_O, //o
		  80:RAWKEY_P, //p
		  81:RAWKEY_Q, //q
		  82:RAWKEY_R, //r
		  83:RAWKEY_S, //s
		  84:RAWKEY_T, //t
		  85:RAWKEY_U, //u
		  86:RAWKEY_V, //v
		  87:RAWKEY_W, //w
		  88:RAWKEY_X, //x
		  89:RAWKEY_Z, //y
		  90:RAWKEY_Y, //z
		  91:RAWKEY_LAMIGA, //left window key	
		  92:RAWKEY_RAMIGA, //right window key
		  93:RAWKEY_HELP, //select key	 		
		  96:RAWKEY_KP_0, //numpad 0	 			
		  97:RAWKEY_KP_1, //numpad 1	 			
		  98:RAWKEY_KP_2, //numpad 2	 			
		  99:RAWKEY_KP_3, //numpad 3	 			
		 100:RAWKEY_KP_4, //numpad 4	 			
		 101:RAWKEY_KP_5, //numpad 5	 			
		 102:RAWKEY_KP_6, //numpad 6	 			
		 103:RAWKEY_KP_7, //numpad 7	 			
		 104:RAWKEY_KP_8, //numpad 8	 			
		 105:RAWKEY_KP_9, //numpad 9	 			
		 106:RAWKEY_KP_MULTIPLY, //multiply	 			
		 107:RAWKEY_KP_PLUS, //add	 				
		 109:RAWKEY_KP_MINUS, //subtract	 			
		 110:RAWKEY_KP_DECIMAL, //decimal point	 
		 111:RAWKEY_KP_DIVIDE, //divide	 			
		 112:RAWKEY_F1	, //f1	 					
		 113:RAWKEY_F2	, //f2	 					
		 114:RAWKEY_F3	, //f3	 					
		 115:RAWKEY_F4	, //f4	 					
		 116:RAWKEY_F5	, //f5	 					
		 117:RAWKEY_F6	, //f6	 					
		 118:RAWKEY_F7	, //f7	 					
		 119:RAWKEY_F8	, //f8	 					
		 120:RAWKEY_F9	, //f9	 					
		 121:RAWKEY_F10, //f10	
		 //122:RAWKEY_F11, //f11	 				
		 //123:RAWKEY_F12, //f12	 				
		 //144:RAWKEY_NUMLOCK, //num lock	 			
		 //145:RAWKEY_SCRLOCK, //scroll lock	 		         
		 160:RAWKEY_TILDE,	 		
		 163:RAWKEY_2B,	 		
		 171:RAWKEY_RBRACKET,	 		
		 173:RAWKEY_SLASH,	 		
		 188:RAWKEY_COMMA,	 		
		 190:RAWKEY_PERIOD,	 		
		 192:RAWKEY_EQUAL           
	};		
	const MAXKEYS = 256;
	const KEYBUFSIZE = 512;

	var keyState = new Uint8Array(MAXKEYS);
	var keyBuf = new Uint8Array(KEYBUFSIZE);
	var state = 0;
	var code = 0;
	var first = 0, last = 0;
	var capsLock = false;
	
	var hsynccnt = 0;
	this.lostsynccnt = 0;

	//for (var k in KeyEvent) document.writeln('KeyEvent.' + k + ' = ' + KeyEvent[k]+'<br />'); //FF
	for (var i = 0; i < MAXKEYS; i++) keyState[i] = false;
	for (var i = 0; i < KEYBUFSIZE; i++) keyBuf[i] = 0;
	
	function _onkeydown(e) { AMIGA.input.keyboard.handleKey(e, true); } 
	function _onkeyup(e) { AMIGA.input.keyboard.handleKey(e, false); } 

	this.setup = function () {
		/*document.onkeydown = function (e) {
		 AMIGA.input.keyboard.keydownup(e, true);
		 }
		 document.onkeyup = function (e) {
		 AMIGA.input.keyboard.keydownup(e, false);
		 }*/
		window.document.addEventListener('keydown', _onkeydown, false);
		window.document.addEventListener('keyup', _onkeyup, false);
	};

	this.cleanup = function () {
		//BUG.info('Keyboard.cleanup()');
		//document.onkeydown = null;
		//document.onkeyup = null;
		window.document.removeEventListener('keydown', _onkeydown, false);
		window.document.removeEventListener('keyup', _onkeyup, false);
	};

	this.reset = function () {
		for (var i = 0; i < MAXKEYS; i++) keyState[i] = false;
		state = 0;
		code = 0;
		first = last = 0;
		hsynccnt = 0;
		this.lostsynccnt = 0;
	};

	this.keysAvail = function () {
		return first != last;
	};

	this.nextKey = function () {
		//assert (first != last);
		var key = keyBuf[last];
		if (++last == KEYBUFSIZE) last = 0;
		return key;
	};

	this.recordKey = function (kc) {
		var next = first + 1;

		if (next == KEYBUFSIZE) next = 0;
		if (next == last) {
			BUG.info('Keyboard() buffer overrun!');
			return false;
		}
		keyBuf[first] = kc;
		first = next;
		return true;
	};
	
	this.processKey = function (code, down) {
		/* Caps-lock */
		if (code == 20) {
			if (down) {
				capsLock = !capsLock;
				if (!capsLock) return;
			} else {
				if (capsLock) return;
			}
		}

		/* joystick emul */
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			var l, u, r, d, f1, f2;
			switch (AMIGA.config.ports[0].move) {
				case SAEV_Config_Ports_Move_Arrows:
				{
					l = 37;
					u = 38;
					r = 39;
					d = 40;
					break;
				}
				case SAEV_Config_Ports_Move_Numpad:
				{
					l = 100;
					u = 104;
					r = 102;
					d = 101;
					break;
				}
				case SAEV_Config_Ports_Move_WASD:
				{
					l = 65;
					u = 87;
					r = 68;
					d = 83;
					break;
				}
			}
			f1 = AMIGA.config.ports[0].fire[0];
			f2 = AMIGA.config.ports[0].fire[1];
			switch (code) {
				case f1:
				{
					AMIGA.input.joystick[0].button[0] = down;
					break;
				}
				case f2:
				{
					AMIGA.input.joystick[0].button[1] = down;
					break;
				}
				case l:
				{
					AMIGA.input.joystick[0].state[0] = down;
					if (down && AMIGA.input.joystick[0].state[2]) AMIGA.input.joystick[0].state[2] = false;
					break;
				}
				case u:
				{
					AMIGA.input.joystick[0].state[1] = down;
					if (down && AMIGA.input.joystick[0].state[3]) AMIGA.input.joystick[0].state[3] = false;
					break;
				}
				case r:
				{
					AMIGA.input.joystick[0].state[2] = down;
					if (down && AMIGA.input.joystick[0].state[0]) AMIGA.input.joystick[0].state[0] = false;
					break;
				}
				case d:
				{
					AMIGA.input.joystick[0].state[3] = down;
					if (down && AMIGA.input.joystick[0].state[1]) AMIGA.input.joystick[0].state[1] = false;
					break;
				}
			}
		}
		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			var l, u, r, d, f1, f2;
			switch (AMIGA.config.ports[1].move) {
				case SAEV_Config_Ports_Move_Arrows:
				{
					l = 37;
					u = 38;
					r = 39;
					d = 40;
					break;
				}
				case SAEV_Config_Ports_Move_Numpad:
				{
					l = 100;
					u = 104;
					r = 102;
					d = 101;
					break;
				}
				case SAEV_Config_Ports_Move_WASD:
				{
					l = 65;
					u = 87;
					r = 68;
					d = 83;
					break;
				}
			}
			f1 = AMIGA.config.ports[1].fire[0];
			f2 = AMIGA.config.ports[1].fire[1];
			switch (code) {
				case f1:
				{
					AMIGA.input.joystick[1].button[0] = down;
					break;
				}
				case f2:
				{
					AMIGA.input.joystick[1].button[1] = down;
					break;
				}
				case l:
				{
					AMIGA.input.joystick[1].state[0] = down;
					if (down && AMIGA.input.joystick[1].state[2]) AMIGA.input.joystick[1].state[2] = false;
					break;
				}
				case u:
				{
					AMIGA.input.joystick[1].state[1] = down;
					if (down && AMIGA.input.joystick[1].state[3]) AMIGA.input.joystick[1].state[3] = false;
					break;
				}
				case r:
				{
					AMIGA.input.joystick[1].state[2] = down;
					if (down && AMIGA.input.joystick[1].state[0]) AMIGA.input.joystick[1].state[0] = false;
					break;
				}
				case d:
				{
					AMIGA.input.joystick[1].state[3] = down;
					if (down && AMIGA.input.joystick[1].state[1]) AMIGA.input.joystick[1].state[1] = false;
					break;
				}
			}
		}

		if (!AMIGA.config.keyboard.enabled)
			return;

		/* map shift-keys (team17 pinball games) */
		if (AMIGA.config.keyboard.mapShift) {
			switch (code) {
				case 37:
				{ //left arrow
					if (!down) {
						this.recordKey((RAWKEY_LSHIFT << 1) | 1);
					} else {
						this.recordKey(RAWKEY_LSHIFT << 1);
					}
					//break;
					return;
				}
				case 39:
				{ //right arrow
					if (!down) {
						this.recordKey((RAWKEY_RSHIFT << 1) | 1);
					} else {
						this.recordKey(RAWKEY_RSHIFT << 1);
					}
					//break;
					return;
				}
			}
		}

		var rawkey = false;
		if (BrowserDetect.browser == 'Firefox') {
			if (typeof(mozKeyCodeMap[code]) != 'undefined')
				rawkey = mozKeyCodeMap[code];
		} else {
			if (typeof(defKeyCodeMap[code]) != 'undefined')
				rawkey = defKeyCodeMap[code];
		}
		//BUG.info('Keyboard.processKey() code %d $%04x, rawkey $%04x', code, code, rawkey);

		if (rawkey !== false) {
			if (down)
				this.recordKey(rawkey << 1);
			else
				this.recordKey((rawkey << 1) | 1);
		}
	};
	
	this.handleKey = function (e, down) {
		e = e || window.event;
		var code = e.which ? e.which : e.keyCode;

		if (AMIGA.config.keyboard.enabled && code != 122 && code != 123) //all but F11 F12
			e.preventDefault();

		//BUG.info('Keyboard.handleKey() down %d, code %d, alt %d, shift %d, ctrl %d', down?1:0, code, e.altKey?1:0, e.shiftKey?1:0, e.ctrlKey?1:0);

		/* Ctrl-Alt fix */
		if (!down && code == 17 && keyState[18]) {
			keyState[18] = false;
			this.processKey(18, keyState[18]);
		}

		var oldstate = keyState[code];
		if (down && !keyState[code]) {
			keyState[code] = true;
		}
		else if (!down) {
			keyState[code] = false;
		}
		if (keyState[code] != oldstate) {
			this.processKey(code, keyState[code]);
		}
	};

	this.setCode = function (keycode) {
		code = ~((keycode << 1) | (keycode >> 7)) & 0xff;
	};

	this.keyReq = function () {
		this.lostsynccnt = 8 * AMIGA.playfield.maxvpos * 8;
		/* 8 frames * 8 bits */

		//AMIGA.cia.setICR(CIA_A, 8, code);
		AMIGA.cia.SetICRA(8, code);
	};

	this.hsync = function () {
		if ((this.keysAvail() || state < 3) && !this.lostsynccnt && ((++hsynccnt) & 15) == 0) {
			switch (state) {
				case 0:
					code = 0;
					state++;
					break;
				case 1:
					this.setCode(RAWKEY_INIT_POWER_UP);
					state++;
					break;
				case 2:
					this.setCode(RAWKEY_TERM_POWER_UP);
					state++;
					break;
				case 3:
					code = ~this.nextKey() & 0xff;
					break;
			}
			this.keyReq();
		}
	};

	this.vsync = function() {
		if (this.lostsynccnt > 0) {
			this.lostsynccnt -= AMIGA.playfield.maxvpos;
			if (this.lostsynccnt <= 0) {
				this.lostsynccnt = 0;
				this.keyReq();
				//BUG.info('Keyboard() lost sync');
			}
		}
	}
}

function Input() {
	this.mouse = new Mouse();
	this.joystick = new Array(2);
	this.joystick[0] = new Joystick(SAEV_Config_Ports_Type_Joy0);
	this.joystick[1] = new Joystick(SAEV_Config_Ports_Type_Joy1);
	this.keyboard = new Keyboard();

	var potgo = {
		data: 0,
		count: 0
	};

	this.setup = function () {
		this.keyboard.setup();
	};
	
	this.cleanup = function () {
		this.keyboard.cleanup();
	};

	this.reset = function () {
		this.mouse.reset();
		this.joystick[0].reset();
		this.joystick[1].reset();
		this.keyboard.reset();
		potgo.data = 0;
		potgo.count = 0;
	};

	this.POTGO = function (v) {
		//BUG.info('Input.POTGO() $%04x', v);
		potgo.data = v;
	};

	this.POTGOR = function () {
		var v = (potgo.data | (potgo.data << 1)) & 0xaa00;
		v |= v >> 1;

		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			if (this.mouse.button[2]) v &= 0xfbff;
			if (this.mouse.button[1]) v &= 0xfeff;
		} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			if (this.joystick[0].button[1]) v &= 0xfbff;
			if (this.joystick[0].button[2]) v &= 0xfeff;
		}
		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			if (this.joystick[1].button[1]) v &= 0xbfff;
			if (this.joystick[1].button[2]) v &= 0xefff;
		}
		//BUG.info('Input.POTGOR() $%04x', v);
		return v;
	};

	this.POT0DAT = function () {
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			if (this.mouse.button[2]) potgo.count = (potgo.count & 0xff00) | ((potgo.count + 1) & 0xff);
			if (this.mouse.button[1]) potgo.count = (potgo.count + 0x100) & 0xffff;
		}
		//BUG.info('Input.POT0DAT() $%04x', v);
		return potgo.count;
	};

	this.POT1DAT = function () {
		//BUG.info('Input.POT1DAT() NOT IMPLEMENTED');
		return 0xffff;
	};

	this.JOY0DAT = function () {
		if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
			this.mouse.update();
			return this.mouse.pos;
		} else if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Joy0) {
			this.joystick[0].update();
			return this.joystick[0].dir;
		}
		return 0xffff;
	};

	this.JOY1DAT = function () {
		if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Mouse) {
			this.mouse.update();
			return this.mouse.pos;
		} else if (AMIGA.config.ports[1].type == SAEV_Config_Ports_Type_Joy1) {
			this.joystick[1].update();
			return this.joystick[1].dir;
		}
		return 0xffff;
	};

	this.JOYTEST = function (v) {
		//BUG.info('Input.JOYTEST() $%04x', v);
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/
/*
0x0000 0000 	2024.0 	Chip RAM 
0x00C0 0000 	1536.0 	Slow RAM

0x00F8 0000 	256.0 	256K System ROM (Kickstart 2.04 or higher)
0x00FC 0000 	256.0 	256K System ROM

0x00DF F000 	4.0 		Custom chip registers
0x00BF D000 	3.8 		8520-B (even-byte addresses)
0x00BF E001 	3.8 		8520-A (odd-byte addresses)
0x00DC 0000 	64.0 		Real time clock

0x00F0 0000 	512.0 	Reserved 512K System ROM (CDTV or CD³²)
0x00E0 0000 	512.0 	Reserved
0x00A0 0000 	1984.0 	Reserved
0x00D8 0000 	256.0 	Reserved
0x00DD 0000 	188.0 	Reserved

0x0020 0000 	8192.0 	Primary auto-config space (Fast RAM)
0x00E8 0000 	64.0 		Zorro II auto-config space (before relocation)
0x00E9 0000 	448.0 	Secondary auto-config space (usually 64K I/O boards)
*/

function Memory() {   
	const NULL8 = 0xff;
	const NULL16 = 0xffff;
	const NULL32 = 0xffffffff;

	this.chip = {
		size: 0,
		align: 0,
		data: null,
		lower: 0,
		upper: 0
	};
	this.slow = {
		enabled: false,
		size: 0,
		align: 0,
		data: null,
		lower: 0x00C00000,
		upper: 0
	};	
	this.fast = {
		enabled: false,
		size: 0,
		align: 0,
		data: null,
		lower: 0x00200000,
		upper: 0
	};	
	this.rom = {
		size: 0,
		align: 0,
		data: null,
		lower: 0xf80000,
		upper: 0x1000000
	};
	this.res_d8 = {
		size: 0x40000,
		align: 0x20000,
		data: null,
		lower: 0x00D80000,
		upper: 0x00DC0000
	};
	this.res_e0 = {
		size: 0x80000,
		align: 0x40000,
		data: null,
		lower: 0x00E00000,
		upper: 0x00E80000
	};
	this.res_f0 = {
		size: 0x80000,
		align: 0x40000,
		data: null,
		lower: 0x00F00000,
		upper: 0x00F80000
	};
	this.ac_z2 = {
		size: 0x10000,
		lower: 0x00E80000,
		upper: 0x00E90000
	};
	/*this.aros = {
		cached: false,
		rom: '',
		ext: ''
	};*/
	
	function getChipSize(v) {
		switch (v) {
			case SAEV_Config_RAM_Chip_Size_256K: return 256 << 10;
			case SAEV_Config_RAM_Chip_Size_512K: return 512 << 10;
			case SAEV_Config_RAM_Chip_Size_1M: return 1024 << 10;
			case SAEV_Config_RAM_Chip_Size_2M: return 2048 << 10;
			default: return false;
		}		
	} 
	
	function getSlowSize(v) {
		switch (v) {
			case SAEV_Config_RAM_Slow_Size_None: return 0;
			case SAEV_Config_RAM_Slow_Size_256K: return 256 << 10;
			case SAEV_Config_RAM_Slow_Size_512K: return 512 << 10;
			case SAEV_Config_RAM_Slow_Size_1M: return 1024 << 10;
			case SAEV_Config_RAM_Slow_Size_1536K: return 1536 << 10;
			default: return false;
		}		
	} 
	
	function getFastSize(v) {
		switch (v) {
			case SAEV_Config_RAM_Fast_Size_None: return 0;
			case SAEV_Config_RAM_Fast_Size_512K: return 512 << 10;
			case SAEV_Config_RAM_Fast_Size_1M: return 1024 << 10;
			case SAEV_Config_RAM_Fast_Size_2M: return 2048 << 10;
			case SAEV_Config_RAM_Fast_Size_4M: return 4096 << 10;
			case SAEV_Config_RAM_Fast_Size_8M: return 8192 << 10;
			default: return false;
		}		
	} 
	
	function getROMSize(v) {
		switch (v) {
			case SAEV_Config_ROM_Size_256K: return 256 << 10;
			case SAEV_Config_ROM_Size_512K: return 512 << 10;
			default: return false;
		}		
	} 
	
	/*function getEXTSize(v) {
		switch (v) {
			case SAEV_Config_EXT_Size_256K: return 256 << 10;
			case SAEV_Config_EXT_Size_512K: return 512 << 10;
			default: return false;
		}		
	} 
	function getEXTAddr(v) {
		switch (v) {
			case SAEV_Config_EXT_Addr_A0: return 0xa00000;
			case SAEV_Config_EXT_Addr_E0: return 0xe00000;
			case SAEV_Config_EXT_Addr_F0: return 0xf00000;
			default: return false;
		}		
	}*/ 
	
	this.setup = function () {
		this.chip.size = getChipSize(AMIGA.config.ram.chip.size);
		this.chip.align = this.chip.size >>> 1;
		this.chip.data = new Uint16Array(this.chip.align);
		for (var i = 0; i < this.chip.align; i++) this.chip.data[i] = 0;
		this.chip.lower = 0;
		this.chip.upper = this.chip.size;

		if (AMIGA.config.ram.slow.size) {
			this.slow.enabled = true;
			this.slow.size = getSlowSize(AMIGA.config.ram.slow.size);
			this.slow.align = this.slow.size >>> 1;
			this.slow.data = new Uint16Array(this.slow.align);
			for (var i = 0; i < this.slow.align; i++) this.slow.data[i] = 0;
			this.slow.upper = this.slow.lower + this.slow.size;
		} else {
			this.slow.enabled = false;
			this.slow.size = 0;
			this.slow.align = 0;
			this.slow.data = null;
			this.slow.upper = 0;
		}
		if (AMIGA.config.ram.fast.size) {
			this.fast.enabled = true;
			this.fast.size = getFastSize(AMIGA.config.ram.fast.size);
			this.fast.align = this.fast.size >>> 1;
			this.fast.data = new Uint16Array(this.fast.align);
			for (var i = 0; i < this.fast.align; i++) this.fast.data[i] = 0;
			this.fast.upper = this.fast.lower + this.fast.size;
		} else {
			this.fast.enabled = false;
			this.fast.size = 0;
			this.fast.align = 0;
			this.fast.data = null;
			this.fast.upper = 0;
		}
		BUG.info('Memory.init() chip %d, slow %d, fast %d', this.chip.size >>> 10, this.slow.size >>> 10, this.fast.size >>> 10);

		this.rom.size = getROMSize(AMIGA.config.rom.size);
		this.rom.align = this.rom.size >>> 1;
		this.rom.data = new Uint16Array(this.rom.align);
		for (var i = 0; i < this.rom.align; i++) this.rom.data[i] = 0;

		this.res_d8.data = new Uint16Array(this.res_d8.align);
		for (var i = 0; i < this.res_d8.align; i++) this.res_d8.data[i] = 0;
		this.res_e0.data = new Uint16Array(this.res_e0.align);
		for (var i = 0; i < this.res_e0.align; i++) this.res_e0.data[i] = 0;
		this.res_f0.data = new Uint16Array(this.res_f0.align);
		for (var i = 0; i < this.res_f0.align; i++) this.res_f0.data[i] = 0;

		this.copy_rom(AMIGA.config.rom.data);

		if (AMIGA.config.ext.size != SAEV_Config_EXT_Size_None) {
			if (AMIGA.config.ext.addr == SAEV_Config_EXT_Addr_E0)
				this.copy_e0(AMIGA.config.ext.data);
			else if (AMIGA.config.ext.addr == SAEV_Config_EXT_Addr_F0)
				this.copy_f0(AMIGA.config.ext.data);
		}
		//this.mirror_rom_to_chipram();

		/*if (AMIGA.config.rom.mode == 1) {
		 if (!this.aros.cached) {
		 BUG.info('Memory.setup() AROS-ROM is not cached, downloading...');
		 AMIGA.loading += 2;
		 loadRemote('aros-amiga-m68k-rom.bin', 0xfc4635e1, function(data) {
		 AMIGA.mem.aros.cached = true;
		 AMIGA.mem.aros.rom = data;
		 AMIGA.mem.copy_rom(data);
		 AMIGA.loading--;
		 });
		 loadRemote('aros-amiga-m68k-ext.bin', 0xc612f82e, function(data) {
		 AMIGA.mem.aros.cached = true;
		 AMIGA.mem.aros.ext = data;
		 AMIGA.mem.copy_e0(data);
		 AMIGA.loading--;
		 });
		 } else {
		 BUG.info('Memory.setup() AROS-ROM is cached, download skipped.');
		 this.copy_rom(this.aros.rom);
		 this.copy_e0(this.aros.ext);
		 }
		 } else {
		 AMIGA.loading++;
		 loadLocal('cfg_rom_name', function(event) {
		 AMIGA.mem.copy_rom(event.target.result);
		 AMIGA.loading--;
		 });
		 if (AMIGA.config.ext.size > 0) {
		 AMIGA.loading++;
		 loadLocal('cfg_ext_name', function(event) {
		 if (AMIGA.config.ext.addr == 0xe00000)
		 AMIGA.mem.copy_e0(event.target.result);
		 else
		 AMIGA.mem.copy_f0(event.target.result);

		 AMIGA.loading--;
		 });
		 }
		 }*/
	};

	this.load8 = function (addr) {
		//BUG.info('Memory.load8() addr $%08x', addr);

		if (addr >= 0x000000 && addr < this.chip.size) {
			return (addr & 1) ? (this.chip.data[addr >>> 1] & 0xff) : (this.chip.data[addr >>> 1] >> 8);
		}
		else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper) {
			return (addr & 1) ? (this.slow.data[(addr - this.slow.lower) >>> 1] & 0xff) : (this.slow.data[(addr - this.slow.lower) >>> 1] >> 8);
		}
		else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper) {
			return (addr & 1) ? (this.fast.data[(addr - this.fast.lower) >>> 1] & 0xff) : (this.fast.data[(addr - this.fast.lower) >>> 1] >> 8);
		}
		else if (addr >= this.rom.lower && addr < this.rom.upper) {
			return (addr & 1) ? (this.rom.data[(addr - this.rom.lower) >>> 1] & 0xff) : (this.rom.data[(addr - this.rom.lower) >>> 1] >> 8);
		}
		else if (addr >= 0xdff000 && addr < 0xe00000) {
			return AMIGA.custom.load8(addr);
		}
		else if (addr >= 0xbfd000 && addr < 0xbfdf01) {
			return AMIGA.cia.load8(addr);
		}
		else if (addr >= 0xbfe001 && addr < 0xbfef02) {
			return AMIGA.cia.load8(addr);
		}
		else if (addr >= 0xdc0000 && addr < 0xdd0000) {
			return AMIGA.rtc.load8(addr);
		}
		else if (addr >= this.res_e0.lower && addr < this.res_e0.upper) {
			return (addr & 1) ? (this.res_e0.data[(addr - this.res_e0.lower) >>> 1] & 0xff) : (this.res_e0.data[(addr - this.res_e0.lower) >>> 1] >> 8);
		}
		else if (addr >= this.res_f0.lower && addr < this.res_f0.upper) {
			return (addr & 1) ? (this.res_f0.data[(addr - this.res_f0.lower) >>> 1] & 0xff) : (this.res_f0.data[(addr - this.res_f0.lower) >>> 1] >> 8);
		}
		else if (addr >= this.res_d8.lower && addr < this.res_d8.upper) {
			return (addr & 1) ? (this.res_d8.data[(addr - this.res_d8.lower) >>> 1] & 0xff) : (this.res_d8.data[(addr - this.res_d8.lower) >>> 1] >> 8);
		}
		else if (addr >= this.ac_z2.lower && addr < this.ac_z2.upper) {
			return AMIGA.expansion.load8(addr);
		}
		//else BUG.info('Memory.load8() ILLEGAL MEMORY ACCESS addr $%08x', addr);

		return NULL8;
	};

	this.load16 = function (addr) {
		//BUG.info('Memory.load16() addr $%08x', addr);

		if (addr >= 0 && addr < this.chip.size - 1) {
			return this.chip.data[addr >>> 1];
		}
		else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 1) {
			return this.slow.data[(addr - this.slow.lower) >>> 1];
		}
		else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 1) {
			return this.fast.data[(addr - this.fast.lower) >>> 1];
		}
		else if (addr >= this.rom.lower && addr < this.rom.upper - 1) {
			return this.rom.data[(addr - this.rom.lower) >>> 1];
		}
		else if (addr >= 0xdff000 && addr < 0xe00000 - 1) {
			return AMIGA.custom.load16(addr);
		}
		else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 1) {
			return AMIGA.cia.load16(addr);
		}
		else if (addr >= 0xbfe001 && addr < 0xbfef02 - 1) {
			return AMIGA.cia.load16(addr);
		}
		else if (addr >= 0xdc0000 && addr < 0xdd0000 - 1) {
			return AMIGA.rtc.load16(addr);
		}
		else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 1) {
			return this.res_e0.data[(addr - this.res_e0.lower) >>> 1];
		}
		else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 1) {
			return this.res_f0.data[(addr - this.res_f0.lower) >>> 1];
		}
		else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 1) {
			return this.res_d8.data[(addr - this.res_d8.lower) >>> 1];
		}
		//else BUG.info('Memory.load16() ILLEGAL MEMORY ACCESS addr $%08x', addr);

		return NULL16;
	};

	this.load32 = function (addr) {
		//BUG.info('Memory.load32() addr $%08x', addr);

		if (addr >= 0 && addr < this.chip.size - 3) {
			addr >>>= 1;
			return ((this.chip.data[addr] << 16) | this.chip.data[addr + 1]) >>> 0;
		}
		else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 3) {
			addr = (addr - this.slow.lower) >>> 1;
			return ((this.slow.data[addr] << 16) | this.slow.data[addr + 1]) >>> 0;
		}
		else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 3) {
			addr = (addr - this.fast.lower) >>> 1;
			return ((this.fast.data[addr] << 16) | this.fast.data[addr + 1]) >>> 0;
		}
		else if (addr >= this.rom.lower && addr < this.rom.upper - 3) {
			addr = (addr - this.rom.lower) >>> 1;
			return ((this.rom.data[addr] << 16) | this.rom.data[addr + 1]) >>> 0;
		}
		else if (addr >= 0xdff000 && addr < 0xe00000 - 3) {
			return AMIGA.custom.load32(addr);
		}
		else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 3) {
			return AMIGA.cia.load32(addr);
		}
		else if (addr >= 0xbfe001 && addr < 0xbfef02 - 3) {
			return AMIGA.cia.load32(addr);
		}
		else if (addr >= 0xdc0000 && addr < 0xdd0000 - 3) {
			return AMIGA.rtc.load32(addr);
		}
		else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 3) {
			addr = (addr - this.res_e0.lower) >>> 1;
			return ((this.res_e0.data[addr] << 16) | this.res_e0.data[addr + 1]) >>> 0;
		}
		else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 3) {
			addr = (addr - this.res_f0.lower) >>> 1;
			return ((this.res_f0.data[addr] << 16) | this.res_f0.data[addr + 1]) >>> 0;
		}
		else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 3) {
			addr = (addr - this.res_d8.lower) >>> 1;
			return ((this.res_d8.data[addr] << 16) | this.res_d8.data[addr + 1]) >>> 0;
		}
		//else BUG.info('Memory.load32() ILLEGAL MEMORY ACCESS addr $%08x', addr);

		return NULL32;
	};

	this.store8 = function (addr, value) {
		//BUG.info('Memory.store8() addr $%08x, val $%02x', addr, value);

		if (addr >= 0 && addr < this.chip.size) {
			if (addr & 1) {
				addr >>>= 1;
				this.chip.data[addr] = (this.chip.data[addr] & 0xff00) | value;
			} else {
				addr >>>= 1;
				this.chip.data[addr] = (value << 8) | (this.chip.data[addr] & 0x00ff);
			}
		}
		else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper) {
			if (addr & 1) {
				addr = (addr - this.slow.lower) >>> 1;
				this.slow.data[addr] = (this.slow.data[addr] & 0xff00) | value;
			} else {
				addr = (addr - this.slow.lower) >>> 1;
				this.slow.data[addr] = (value << 8) | (this.slow.data[addr] & 0x00ff);
			}
		}
		else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper) {
			if (addr & 1) {
				addr = (addr - this.fast.lower) >>> 1;
				this.fast.data[addr] = (this.fast.data[addr] & 0xff00) | value;
			} else {
				addr = (addr - this.fast.lower) >>> 1;
				this.fast.data[addr] = (value << 8) | (this.fast.data[addr] & 0x00ff);
			}
		}
		else if (addr >= 0xdff000 && addr < 0xe00000) {
			AMIGA.custom.store8(addr, value);
		}
		else if (addr >= 0xbfd000 && addr < 0xbfdf01) {
			AMIGA.cia.store8(addr, value);
		}
		else if (addr >= 0xbfe001 && addr < 0xbfef02) {
			AMIGA.cia.store8(addr, value);
		}
		else if (addr >= 0xdc0000 && addr < 0xdd0000) {
			AMIGA.rtc.store8(addr, value);
		}
		else if (addr >= this.res_e0.lower && addr < this.res_e0.upper) {
			if (addr & 1) {
				addr = (addr - this.res_e0.lower) >>> 1;
				this.res_e0.data[addr] = (this.res_e0.data[addr] & 0xff00) | value;
			} else {
				addr = (addr - this.res_e0.lower) >>> 1;
				this.res_e0.data[addr] = (value << 8) | (this.res_e0.data[addr] & 0x00ff);
			}
		}
		else if (addr >= this.res_f0.lower && addr < this.res_f0.upper) {
			if (addr & 1) {
				addr = (addr - this.res_f0.lower) >>> 1;
				this.res_f0.data[addr] = (this.res_f0.data[addr] & 0xff00) | value;
			} else {
				addr = (addr - this.res_f0.lower) >>> 1;
				this.res_f0.data[addr] = (value << 8) | (this.res_f0.data[addr] & 0x00ff);
			}
		}
		else if (addr >= this.res_d8.lower && addr < this.res_d8.upper) {
			if (addr & 1) {
				addr = (addr - this.res_d8.lower) >>> 1;
				this.res_d8.data[addr] = (this.res_d8.data[addr] & 0xff00) | value;
			} else {
				addr = (addr - this.res_d8.lower) >>> 1;
				this.res_d8.data[addr] = (value << 8) | (this.res_d8.data[addr] & 0x00ff);
			}
		}
		else if (addr >= this.ac_z2.lower && addr < this.ac_z2.upper) {
			AMIGA.expansion.store8(addr, value);
		}
		//else BUG.info('Memory.store8() ILLEGAL MEMORY ACCESS addr $%08x, val %02x', addr, value);
	};
	
	this.store16 = function (addr, value) {
		//BUG.info('Memory.store16() addr $%08x, val $%04x', addr, value);

		if (addr >= 0 && addr < this.chip.size - 1) {
			this.chip.data[addr >>> 1] = value;
		}
		else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 1) {
			this.slow.data[(addr - this.slow.lower) >>> 1] = value;
		}
		else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 1) {
			this.fast.data[(addr - this.fast.lower) >>> 1] = value;
		}
		else if (addr >= 0xdff000 && addr < 0xe00000 - 1) {
			AMIGA.custom.store16(addr, value);
		}
		else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 1) {
			AMIGA.cia.store16(addr, value);
		}
		else if (addr >= 0xbfe001 && addr < 0xbfef02 - 1) {
			AMIGA.cia.store16(addr, value);
		}
		else if (addr >= 0xdc0000 && addr < 0xdd0000 - 1) {
			AMIGA.rtc.store16(addr, value);
		}
		else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 1) {
			this.res_e0.data[(addr - this.res_e0.lower) >>> 1] = value;
		}
		else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 1) {
			this.res_f0.data[(addr - this.res_f0.lower) >>> 1] = value;
		}
		else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 1) {
			this.res_d8.data[(addr - this.res_d8.lower) >>> 1] = value;
		}
		//else BUG.info('Memory.store16() ILLEGAL MEMORY ACCESS addr $%08x, val %04x', addr, value);
	};

	this.store32 = function (addr, value) {
		//BUG.info('Memory.store32() addr $%08x, val $%08x', addr, value);

		if (addr >= 0 && addr < this.chip.size - 3) {
			addr >>>= 1;
			this.chip.data[addr] = value >>> 16;
			this.chip.data[addr + 1] = value & 0xffff;
		}
		else if (this.slow.enabled && addr >= this.slow.lower && addr < this.slow.upper - 3) {
			addr = (addr - this.slow.lower) >>> 1;
			this.slow.data[addr] = value >>> 16;
			this.slow.data[addr + 1] = value & 0xffff;
		}
		else if (this.fast.enabled && addr >= this.fast.lower && addr < this.fast.upper - 3) {
			addr = (addr - this.fast.lower) >>> 1;
			this.fast.data[addr] = value >>> 16;
			this.fast.data[addr + 1] = value & 0xffff;
		}
		else if (addr >= 0xdff000 && addr < 0xe00000 - 3) {
			AMIGA.custom.store32(addr, value);
		}
		else if (addr >= 0xbfd000 && addr < 0xbfdf01 - 3) {
			AMIGA.cia.store32(addr, value);
		}
		else if (addr >= 0xbfe001 && addr < 0xbfef02 - 3) {
			AMIGA.cia.store32(addr, value);
		}
		else if (addr >= 0xdc0000 && addr < 0xdd0000 - 3) {
			AMIGA.rtc.store32(addr, value);
		}
		else if (addr >= this.res_e0.lower && addr < this.res_e0.upper - 3) {
			addr = (addr - this.res_e0.lower) >>> 1;
			this.res_e0.data[addr] = value >>> 16;
			this.res_e0.data[addr + 1] = value & 0xffff;
		}
		else if (addr >= this.res_f0.lower && addr < this.res_f0.upper - 3) {
			addr = (addr - this.res_f0.lower) >>> 1;
			this.res_f0.data[addr] = value >>> 16;
			this.res_f0.data[addr + 1] = value & 0xffff;
		}
		else if (addr >= this.res_d8.lower && addr < this.res_d8.upper - 3) {
			addr = (addr - this.res_d8.lower) >>> 1;
			this.res_d8.data[addr] = value >>> 16;
			this.res_d8.data[addr + 1] = value & 0xffff;
		}
		//else if (!(addr & 0xc80000)) BUG.info('Memory.store32() ILLEGAL MEMORY ACCESS addr $%08x, val %08x', addr, value);
	};

	/*this.check16_chip = function (addr, size) {
		return (addr >= 0 && addr + size < this.chip.size - 1);
	};*/
	/*this.load16_chip = function (addr) {
		if (this.check16_chip(addr, 1)) {
			var v = this.chip.data[addr >>> 1];
			AMIGA.custom.last_value = v;
			return v;
		} else BUG.info('load16_chip() ILLEGAL MEMORY ACCESS addr %x', addr);
		return 0xffff;
	}
	this.store16_chip = function (addr, value) { 
		if (this.check16_chip(addr, 1)) {
			this.chip.data[addr >>> 1] = value;
			AMIGA.custom.last_value = value;
		} else BUG.info('store16_chip() ILLEGAL MEMORY ACCESS addr %x, value %x', addr, value);
	}
	this.load16_chip = function (addr) { 
		if (addr < this.chip.size - 1)
			AMIGA.custom.last_value = this.chip.data[addr >>> 1];
		else
			AMIGA.custom.last_value = 0xffff;

		return AMIGA.custom.last_value;
	}
	this.store16_chip = function (addr, value) { 
		if (addr < this.chip.size - 1)
			this.chip.data[addr >>> 1] = AMIGA.custom.last_value = value;
		else
			AMIGA.custom.last_value = 0xffff;
	}*/

	this.copy_rom = function (data) {
		//BUG.info('copyrom() size %d', data.length);
		//BUG.info('copyrom() crc32 $%08x', crc32(data));

		if (data.length == 0x80000) {
			/*var lo = crc32(data.substr(0, 0x40000));
			 var hi = crc32(data.substr(0x40000, 0x80000));
			 if (lo != hi) {
			 BUG.info('copyrom() lo crc32 $%08x', lo);
			 BUG.info('copyrom() hi crc32 $%08x', hi);
			 }*/
			for (var i = 0; i < data.length; i++) {
				var v = data.charCodeAt(i) & 0xff;
				if (i & 1) {
					var j = i >>> 1;
					this.rom.data[j] = (this.rom.data[j] & 0xff00) | v;
				} else {
					var j = i >>> 1;
					this.rom.data[j] = (v << 8) | (this.rom.data[j] & 0x00ff);
				}
			}
			this.rom.lower = 0xf80000;
		}
		else if (data.length == 0x40000) {
			for (var i = 0; i < data.length; i++) {
				var v = data.charCodeAt(i) & 0xff;
				if (i & 1) {
					var j = i >>> 1;
					this.rom.data[j] = (this.rom.data[j] & 0xff00) | v;
					this.rom.data[0x20000 + j] = (this.rom.data[0x20000 + j] & 0xff00) | v;
				} else {
					var j = i >>> 1;
					this.rom.data[j] = (v << 8) | (this.rom.data[j] & 0x00ff);
					this.rom.data[0x20000 + j] = (v << 8) | (this.rom.data[0x20000 + j] & 0x00ff);
				}
			}
			this.rom.lower = 0xfc0000;
		}
	};
	
	this.copy_e0 = function (data) {
		if (data.length <= 0x80000) {
			for (var i = 0; i < data.length; i++) {
				var v = data.charCodeAt(i) & 0xff;
				if (i & 1) {
					var j = i >>> 1;
					this.res_e0.data[j] = (this.res_e0.data[j] & 0xff00) | v;
				} else {
					var j = i >>> 1;
					this.res_e0.data[j] = (v << 8) | (this.res_e0.data[j] & 0x00ff);
				}
			}
		}
	};
	this.copy_f0 = function (data) {
		if (data.length <= 0x80000) {
			for (var i = 0; i < data.length; i++) {
				var v = data.charCodeAt(i) & 0xff;
				if (i & 1) {
					var j = i >>> 1;
					this.res_f0.data[j] = (this.res_f0.data[j] & 0xff00) | v;
				} else {
					var j = i >>> 1;
					this.res_f0.data[j] = (v << 8) | (this.res_f0.data[j] & 0x00ff);
				}
			}
		}
	};
	
	/*this.mirror_rom_to_chipram = function() {
		for (var i = 0; i < this.rom.size; i++)
			this.chip.data[i] = this.rom.data[i];
	}*/
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
***************************************************************************
* Notes: 
*  - Ported from WinUAE 2.5.0
*  - AGA support is commented out.
*
**************************************************************************/

function Playfield() {
	function Decision() {     
		this.plfleft = 0;
		this.plfright = 0;
		this.plflinelen = 0;
		this.diwfirstword = 0;
		this.diwlastword = 0;
		this.ctable = 0;
		this.bplcon0 = 0;
		this.bplcon2 = 0;
		this.bplcon3 = 0;
/*#ifdef AGA
		this.bplcon4 = 0;
#endif*/
		this.nr_planes = 0;
		this.bplres = 0;
		this.ehb_seen = false;
		this.ham_seen = false;
		this.ham_at_start = false;

		this.clr = function () {
			this.plfleft = 0;
			this.plfright = 0;
			this.plflinelen = 0;
			this.diwfirstword = 0;
			this.diwlastword = 0;
			this.ctable = 0;
			this.bplcon0 = 0;
			this.bplcon2 = 0;
			this.bplcon3 = 0;
			/*#ifdef AGA
			 this.bplcon4 = 0;
			 #endif*/
			this.nr_planes = 0;
			this.bplres = 0;
			this.ehb_seen = false;
			this.ham_seen = false;
			this.ham_at_start = false;
		};

		this.set = function(src) {
			this.plfleft = src.plfleft;  
			this.plfright = src.plfright; 
			this.plflinelen = src.plflinelen;
			this.diwfirstword = src.diwfirstword;
			this.diwlastword = src.diwlastword; 
			this.ctable = src.ctable;                                                           
			this.bplcon0 = src.bplcon0;  
			this.bplcon2 = src.bplcon2;  
			this.bplcon3 = src.bplcon3;  
/*#ifdef AGA 
			this.bplcon4 = src.bplcon4;  
#endif*/ 
			this.nr_planes = src.nr_planes;
			this.bplres = src.bplres;   
			this.ehb_seen = src.ehb_seen;
			this.ham_seen = src.ham_seen;
			this.ham_at_start = src.ham_at_start;
		}
	}
	
	function ColorEntry() {
		this.color_regs_ecs = new Uint16Array(32);
//#ifndef AGA
		this.acolors = new Uint32Array(32);
/*#else
		this.acolors = new Uint32Array(256);
		this.color_regs_aga = new Uint32Array(256);
#endif*/
		this.borderblank = false;
	}

	function ColorChange() {
		this.linepos = 0;
		this.regno = 0;
		this.value = 0;

		this.set = function (v) {
			this.linepos = v.linepos;
			this.regno = v.regno;
			this.value = v.value;
		};	
		this.cmp = function(v) {
			return (this.linepos == v.linepos && this.regno == v.regno && this.value == v.value ? 0 : 1); 
		}	
	}

	function DrawInfo() {
		this.first_sprite_entry = 0; 
		this.last_sprite_entry = 0;
		this.first_color_change = 0; 
		this.last_color_change = 0;
		this.nr_color_changes = 0; 
		this.nr_sprites = 0;
	}

	function VidBuffer() {
		this.rowbytes = 0; /* Bytes per row in the memory pointed at by bufmem. */
		this.pixbytes = 0; /* Bytes per pixel. */
		/* size of this buffer */
		this.width_allocated = 0;
		this.height_allocated = 0;
		/* size of max visible image */
		this.outwidth = 0;
		this.outheight = 0;
		/* nominal size of image for centering */
		this.inwidth = 0;
		this.inheight = 0;
		/* same but doublescan multiplier included */
		this.inwidth2 = 0;
		this.inheight2 = 0;
		/* extra width, chipset hpos extra in right border */
		this.extrawidth = 0;

		//this.xoffset = 0; /* superhires pixels from left edge */
		//this.yoffset = 0; /* lines from top edge */
		this.inxoffset = 0; /* positive if sync positioning */
		//this.inyoffset = 0;
	}	

	/*---------------------------------*/
	/* drawing */	
		
	//const dblpfofs = [0, 2, 4, 8, 16, 32, 64, 128]; //DELETE

	var dblpf_ms1 = new Uint8Array(256);	
	var dblpf_ms2 = new Uint8Array(256);	
	var dblpf_ms = new Uint8Array(256);	
	var dblpf_ind1 = new Uint8Array(256);	
	var dblpf_ind2 = new Uint8Array(256);	
	var dblpf_2nd1 = new Uint8Array(256);	
	var dblpf_2nd2 = new Uint8Array(256);	
	
	var linestate = new Uint8Array((MAXVPOS + 2) * 2 + 1); //[(MAXVPOS + 2) * 2 + 1]; 
	for (var i = 0; i < linestate.length; i++)
		linestate[i] = 0;
	
	var line_data = []; //[(MAXVPOS + 2) * 2][MAX_PLANES * MAX_WORDS_PER_LINE * 2];
	for (var i = 0; i < (MAXVPOS + 2) * 2; i++) { 
		line_data[i] = []; 
		for (var j = 0; j < MAX_PLANES; j++) { 
			line_data[i][j] = new Uint32Array(MAX_WORDS_PER_LINE * 2); 
			for (var k = 0; k < MAX_WORDS_PER_LINE * 2; k++) 
				line_data[i][j][k] = 0; 
		}
	}

	var line_decisions = []; 
	for (var i = 0; i < 2 * (MAXVPOS + 2) + 1; i++)
		line_decisions[i] = new Decision();
	var color_tables = []; 
	for (var i = 0; i < 2; i++) { 
		color_tables[i] = []; 
		for (var j = 0; j < COLOR_TABLE_SIZE; j++) 
			color_tables[i][j] = new ColorEntry();
	}
	var color_changes = []; 
	for (var i = 0; i < 2; i++) { 
		color_changes[i] = []; 
		for (var j = 0; j < MAX_REG_CHANGE; j++) 
			color_changes[i][j] = new ColorChange();
	}
	var line_drawinfo = []; 
	for (var i = 0; i < 2; i++) { 
		line_drawinfo[i] = []; 
		for (var j = 0; j < 2 * (MAXVPOS + 2) + 1; j++) 
			line_drawinfo[i][j] = new DrawInfo();
	}
	
	var gfxvidinfo = {
		maxblocklines:0,
		drawbuffer: new VidBuffer(),
		gfx_resolution_reserved: 0, // reserved space for currprefs.hresolution
		gfx_vresolution_reserved: 0, // reserved space for currprefs.hresolution
		xchange: 0, /* how many superhires pixels in one pixel in buffer */
		ychange: 0 /* how many interlaced lines in one line in buffer */
	};

	var xlinebuffer = new Uint32Array(MAX_PIXELS_PER_LINE);
	for (var i = 0; i < xlinebuffer.length; i++) xlinebuffer[i] = 0; 

	var ham_linebuf = new Uint32Array(MAX_PIXELS_PER_LINE << 1);
	for (var i = 0; i < ham_linebuf.length; i++) ham_linebuf[i] = 0; 

	var apixels = new Uint8Array(MAX_PIXELS_PER_LINE << 1);
	for (var i = 0; i < apixels.length; i++) apixels[i] = 0; 
	
	var colors_for_drawing = new ColorEntry();
	var current_colors = new ColorEntry();

	var xcolors = new Uint32Array(4096);
	for (var i = 0; i < xcolors.length; i++) xcolors[i] = 0;
	
	var thisline_decision = new Decision();	
	var thisline_changed = 0;
	
	var amiga2aspect_line_map = null;
	var native2amiga_line_map = null;

	var curr_sprite_entries = null;
	var prev_sprite_entries = null;
	var curr_color_changes = null;
	var prev_color_changes = null;
	var curr_drawinfo = null;
	var prev_drawinfo = null;
	var curr_color_tables = null;
	var prev_color_tables = null;	
	var current_change_set = 0;
	
	var autoscale_bordercolors	= 0;
	var frame_redraw_necessary = 0;	
		
	var first_drawn_line = 0;
	var last_drawn_line = 0;
	var first_block_line = 0;
	var last_block_line = 0;
	var thisframe_first_drawn_line = 0;
	var thisframe_last_drawn_line = 0;
	
	var drawing_color_matches = -1;
	var linedbl = 0, linedbld = 0;	
	var min_diwstart = 0;
	var max_diwstop = 0;
	var min_ypos_for_screen = 0;
	var max_ypos_thisframe = 0;
	
	var visible_left_border = 0;	
	var visible_right_border = 0;	
	var visible_left_start = 0;
	var visible_right_stop = MAX_STOP;
	var visible_top_start = 0;
	var visible_bottom_stop = MAX_STOP;	
	var thisframe_y_adjust = 0;	
	var thisframe_y_adjust_real = 0;
	var max_drawn_amiga_line = 0;	
	var linetoscr_x_adjust_bytes = 0;	
	var last_max_ypos = 0;	
	var extra_y_adjust = 0;	
	var center_reset = true;
	var framecnt = 0;
	var last_redraw_point = 0;
	var lores_shift = 0;
	
	var dp_for_drawing = null;
	var dip_for_drawing = null;
	var hposblank = 0;
	//var bplxor = 0;

	var playfield_start = 0, playfield_end = 0;		
	var real_playfield_start = 0, real_playfield_end = 0;
	var linetoscr_diw_start = 0, linetoscr_diw_end = 0;
	var native_ddf_left = 0, native_ddf_right = 0;

	var unpainted = 0; /* How many pixels in window coordinates which are to the left of the left border.  */
	var pixels_offset = 0;
	var src_pixel = 0, ham_src_pixel = 0;
	var ham_decode_pixel = 0;
	var ham_lastcolor = 0;

	var next_color_change = 0;
	var next_color_entry = 0;
	var remembered_color_entry = -1;
	var color_src_match = -1;
	var color_dest_match = -1;
	var color_compare_result = 0;

	var res_shift = 0;
	var bplres = 0;
	var bplplanecnt = 0;
	var bplham = false;
	var bplehb = false;
	var issprites = 0;
	var ecsshres = false;
	var plf1pri = 0;
	var plf2pri = 0;
	var plf_sprite_mask = 0;
	var bpldualpf = false;
	var bpldualpfpri = false;	
	
	/*---------------------------------*/
	/* sprites */	
	
	function Sprite() {
		this.pt = 0;
		this.xpos = 0;
		this.vstart = 0;
		this.vstop = 0;
		this.dblscan = 0; /* AGA SSCAN2 */
		this.armed = 0;
		this.dmastate = 0;
		this.dmacycle = 0;
		this.ptxhpos = 0;

		this.clr = function() {
			this.pt = 0;
			this.xpos = 0;
			this.vstart = 0;
			this.vstop = 0;
			//this.dblscan = 0;
			this.armed = 0;
			this.dmastate = 0;
			this.dmacycle = 0;
			this.ptxhpos = 0;
		}	
	}
	
	function SpriteEntry() {
		this.pos = 0;
		this.max = 0;
		this.first_pixel = 0;
		this.has_attached = false;
	}

	function SpritePixelsBuf() {
		this.attach = 0;
		this.stdata = 0;
		this.data = 0;
		
		this.clr = function() {
			this.attach = 0;
			this.stdata = 0;
			this.data = 0;
		}
	}

	var sprinit = false;
	var sprtaba = new Uint32Array(256);
	var sprtabb = new Uint32Array(256);
	var sprite_ab_merge = new Uint32Array(256);
	var sprclx = new Uint32Array(16);
	var clxmask = new Uint32Array(16);

	var sprite_offs = new Uint8Array(256);	
	var clxtab = new Uint32Array(256);	
	
	var spr = [];
	for (var i = 0; i < MAX_SPRITES; i++)
		spr[i] = new Sprite();
		
	/*union sps_union {
		uae_u8 bytes[MAX_SPR_PIXELS * 2];
		uae_u32 words[MAX_SPR_PIXELS * 2 / 4];
	};*/
	var spixstate = new Uint8Array(MAX_SPR_PIXELS << 1);	
	var spixels = new Uint16Array(MAX_SPR_PIXELS << 1);
	for (var i = 0; i < MAX_SPR_PIXELS << 1; i++)
		spixstate[i] = spixels[i] = 0;
	
	var sprite_entries = []; //[2][MAX_SPR_PIXELS / 16];
	for (var i = 0; i < 2; i++) {
		sprite_entries[i] = [];		
		for (var j = 0; j < MAX_SPR_PIXELS >> 4; j++) 
			sprite_entries[i][j] = new SpriteEntry();		
	}

	var spritepixels = []; 
	for (var i = 0; i < MAX_PIXELS_PER_LINE; i++)
		spritepixels[i] = new SpritePixelsBuf();		

	var sprctl = new Uint16Array(MAX_SPRITES);
	var sprpos = new Uint16Array(MAX_SPRITES);
	for (var i = 0; i < MAX_SPRITES; i++)
		sprctl[i] = sprpos[i] = 0;

/*#ifdef AGA
	//[MAX_SPRITES][4]
	var sprdata = [];
	var sprdatb = [];
	for (var i = 0; i < MAX_SPRITES; i++) {
		sprdata[i] = new Uint16Array(4);
		sprdatb[i] = new Uint16Array(4);
		for (var j = 0; j < 4; j++) {
			sprdata[i][j] = 0;
			sprdatb[i][j] = 0;
		}
	}
#else*/
	//[MAX_SPRITES][1]
	var sprdata = [];
	var sprdatb = [];
	for (var i = 0; i < MAX_SPRITES; i++) {
		sprdata[i] = new Uint16Array(1);
		sprdatb[i] = new Uint16Array(1);
		sprdata[i][0] = 0;
		sprdatb[i][0] = 0;
	}	
//#endif

	var clxcon = 0;
	var clxcon_bpl_enable = 0;
	var clxcon_bpl_match = 0;
	var clxcon2 = 0;
	var clxdat = 0;

	var sprres = 0;
	var nr_armed = 0;

	var sprite_buffer_res = 0;
	var sprite_vblank_endline = VBLANK_SPRITE_PAL;
	var sprite_minx = 0;
	var sprite_maxx = 0;
	var sprite_width = 0;
	var sprite_first_x = 0;
	var sprite_last_x = 0;	
				
	var sprite_0 = 0;
	var sprite_0_width = 0;
	var sprite_0_height = 0;
	var sprite_0_doubled = 0;
	var sprite_0_colors = [0,0,0,0];

	var next_sprite_entry = 0;
	var next_sprite_forced = 1;
	var prev_next_sprite_entry = 0;
	var last_sprite_point = 0;
	//var magic_sprite_mask = 0xff;

	/*---------------------------------*/
	/* playfield */	

	var bplcon0 = 0;
	var bplcon1 = 0;
	var bplcon2 = 0;
	var bplcon3 = 0;
	var bplcon4 = 0;

	var bpl1mod = 0;
	var bpl2mod = 0;
	
	var bplxdat = [0,0,0,0,0,0,0,0];
	var bplpt = [0,0,0,0,0,0,0,0];
	var bplptx = [0,0,0,0,0,0,0,0];

	var diwstrt = 0;
	var diwstop = 0;
	var ddfstrt = 0;
	var ddfstrt_old_hpos = -1;
	var ddfstop = 0;
	var ddf_change = 0;
	var diwhigh = 0;
	var diwhigh_written = false;
	
	var hdiwstate = 0;
	
	var beamcon0 = 0;
	var new_beamcon0 = 0;
	
	this.vpos = 0;
	this.vpos_count = 0;
	this.vpos_count_diff = 0;
	this.hpos = function () {
		return Math.floor((AMIGA.events.currcycle - AMIGA.events.eventtab[EV_HSYNC].oldcycles) * CYCLE_UNIT_INV);
	};	
	var vpos_previous = 0;
	var hpos_previous = 0;
	
	this.maxvpos = MAXVPOS;
	this.maxvpos_nom = MAXVPOS;
	this.maxvpos_total = MAXVPOS;
	this.maxhpos = MAXHPOS;
	this.maxhpos_short = MAXHPOS;
	
	this.lof_store = 0;
	this.lof_current = 0;
	this.lof_previous = 0;
	this.lof_changed = 0;
	this.lof_changing = 0;
	this.lol = 0;
	
	this.vblank_hz = 0;	
		
	var aga_mode = 0;
	var direct_rgb = 0;
	
	var prevbpl = []; //[2][MAXVPOS][8];	
	for (var i = 0; i < 2; i++) {
		prevbpl[i] = [];		
		for (var j = 0; j < MAXVPOS; j++) { 
			prevbpl[i][j] = new Uint32Array(8);		
			for (var k = 0; k < 8; k++) { 
				prevbpl[i][j][k] = 0;
			}
		}
	}
	
	//var scandoubled_line = 0;
	var doublescan = 0;
	var interlace_seen = 0;
	var interlace_changed = 0;
	var lof_togglecnt_nlace = 0; 
	var lof_togglecnt_lace = 0;
	var nlace_cnt = 0;
	
	var minfirstline = 0;	
	var equ_vblank_endline = 0;
	var equ_vblank_toggle = false;
	
	this.vtotal = MAXVPOS_PAL;
	this.htotal = MAXHPOS_PAL;
	this.hsstop = 0;
	this.hbstrt = 0;
	this.hbstop = 0;
	this.vsstop = 0;
	this.vbstrt = 0;
	this.vbstop = 0;
	this.hsstrt = 0;
	this.vsstrt = 0;
	this.hcenter = 0;
	var hsyncstartpos = 0;
	var hsyncendpos = 0;
	
	var diwstate = 0;
	var ddfstate = 0;
	var diw_change = 2;
	var diw_hstrt = 0;
	var diw_hstop = 0;
	var diw_hcounter = 0;
	var last_hdiw = 0;
	
	var diwfirstword = 0;
	var diwlastword = 0; 
	var plffirstline = 0;
	var plflastline = 0;

	var plfstrt = 0;
	var plfstrt_sprite = 0;
	var plfstrt_start = 0;
	var plfstop = 0;
	
	var plf_state = 0;
	
	var nextline_how = 0;
	var next_lineno = 0;
	var prev_lineno = -1;
	
	var first_bpl_vpos = 0;
	var first_planes_vpos = 0;	
	var last_planes_vpos = 0;
	var firstword_bplcon1 = 0;
	var diwfirstword_total = 0;
	var diwlastword_total = 0;
	var ddffirstword_total = 0;
	var ddflastword_total = 0;
	var plffirstline_total = 0;
	var plflastline_total = 0;
	
	/*var lightpen_active = 0;
	var lightpen_triggered = 0;
	var lightpen_cx = 0;
	var lightpen_cy = 0;
	var lightpen_y1 = -1;
	var lightpen_y2 = -1;
	var vpos_lpen = 0;
	var hpos_lpen = 0;*/

	var bplcon0_d = 0;
	var bplcon0_dd = 0;
	var bplcon1_hpos = 0;
	var bplcon1t = 0;
	var bplcon1t2 = 0;
	
	var badmode = 0;		
	var bplcon0_res = 0;
	var bplcon0_planes = 0;
	var bplcon0_planes_limit = 0;
	
	var fmode = 0;
	var fetchmode = 0;
	var fetchunit = 0;
	var fetchunit_mask = 0;
	const fetchunits = [ 8,8,8,0, 16,8,8,0, 32,16,8,0 ];
	var fetchstart = 0;
	var fetchstart_shift = 0;
	var fetchstart_mask = 0;
	const fetchstarts = [ 3,2,1,0, 4,3,2,0, 5,4,3,0 ];
	var fm_maxplane = 0;
	var fm_maxplane_shift = 0;
	const fm_maxplanes = [ 3,2,1,0, 3,3,2,0, 3,3,3,0 ];
	var real_bitplane_number = []; //[3][3][9];
	
	var fetch_state = 0;
	var fetch_cycle = 0;
	var fetch_modulo_cycle = 0;

	const cycle_sequences = [[2,1,2,1,2,1,2,1], [4,2,3,1,4,2,3,1], [8,4,6,2,7,3,5,1]];
	var cycle_diagram_shift = 0;
	var cycle_diagram_table = null; //[3][3][9][32];
	var cycle_diagram_free_cycles = []; //[3][3][9];
	var cycle_diagram_total_cycles = []; //[3][3][9];
	var curr_diagram = [];	
	
	var estimated_last_fetch_cycle = 0;	
	
	var bpldmasetuphpos = -1;
	var bpldmasetupphase = 0;

	var bpl1dat_written = false;
	var bpl1dat_written_at_least_once = false;
	var bpl1dat_early = false;
	var plfleft_real = -1;
		
	var out_nbits = 0;
	var out_offs = 0;
	var outword = new Uint32Array(MAX_PLANES);	
	var todisplay = []; //[MAX_PLANES][4];
	for (var i = 0; i < MAX_PLANES; i++) {		
		todisplay[i] = new Uint32Array(4);		
		for (var j = 0; j < 4; j++) 
			todisplay[i][j] = 0;		
	}
	var fetched = new Uint32Array(MAX_PLANES);	
	for (var i = 0; i < MAX_PLANES; i++)
		fetched[i] = 0;		
/*#ifdef AGA
	var fetched_aga0 = new Uint32Array(MAX_PLANES);	
	var fetched_aga1 = new Uint32Array(MAX_PLANES);	
#endif*/

	var toscr_res = 0;
	var toscr_nr_planes = 0;
	var toscr_nr_planes2 = 0;
	var toscr_delay1 = 0;
	var toscr_delay2 = 0;
	var toscr_nbits = 0;	

	//var fetchwidth = 0;
	var delayoffset = 0;

	var last_decide_line_hpos = -1;
	var last_ddf_pix_hpos = -1;
	var last_sprite_hpos = -1;
	var last_fetch_hpos = -1;
				
	/*-----------------------------------------------------------------------*/
	/* common */
	/*-----------------------------------------------------------------------*/
		
	/*function RES_SHIFT(res) {
		return res == RES_LORES ? 8 : (res == RES_HIRES ? 4 : 2);
	}*/
	function GET_RES_DENISE(con0) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)) con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x8000) ? RES_HIRES : ((con0 & 0x40) ? RES_SUPERHIRES : RES_LORES);
	}
	function GET_RES_AGNUS(con0) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) con0 &= ~0x40; // SUPERHIRES
		return (con0 & 0x8000) ? RES_HIRES : ((con0 & 0x40) ? RES_SUPERHIRES : RES_LORES);
	}
	function GET_SPRITEWIDTH(fmode) {
		return (((fmode >> 2) & 3) == 3 ? 64 : ((fmode >> 2) & 3) == 0 ? 16 : 32);
	}
	function GET_PLANES(con0) {
		if ((con0 & 0x0010) && (con0 & 0x7000)) return 0; // >8 planes = 0 planes
		if (con0 & 0x0010) return 8; // AGA 8-planes bit
		return (con0 >> 12) & 7; // normal planes bits
	}
	function GET_PLANES_LIMIT(con0) {
		var res = GET_RES_AGNUS(con0);
		var planes = GET_PLANES(con0);
		return real_bitplane_number[fetchmode][res][planes];
	}
	
	this.nodraw = function () {
		return framecnt != 0;
	};

	this.doflickerfix = function () {
		return AMIGA.config.video.vresolution && doublescan < 0 && this.vpos < MAXVPOS;
	};
	
 	this.current_maxvpos = function () {
		return this.maxvpos + (this.lof_store ? 1 : 0);
	};	

	this.is_custom_vsync = function () {
		var vp = this.vpos + 1;
		var vpc = this.vpos_count + 1;
		/* Agnus vpos counter keeps counting until it wraps around if VPOSW writes put it past maxvpos */
		if (vp >= this.maxvpos_total)
			vp = 0;
		/* vpos_count >= MAXVPOS just to not crash if VPOSW writes prevent vsync completely */
		return vp == this.maxvpos + this.lof_store || vp == this.maxvpos + this.lof_store + 1 || vpc >= MAXVPOS;
	};	
	
	this.is_linetoggle = function () {
		if (!(beamcon0 & 0x0800) && !(beamcon0 & 0x0020) && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			return true; //NTSC and !LOLDIS -> LOL toggles every line
		else if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) && AMIGA.config.video.ntsc)
			return true; //hardwired NTSC Agnus
		return false;
	};	

 	this.is_last_line = function () {
		return this.vpos + 1 == this.maxvpos + this.lof_store;
	};	

	/*-----------------------------------------------------------------------*/
	/* drawing */
	/*-----------------------------------------------------------------------*/
	
	function setup_drawing_tables() {
		for (var i = 0; i < 256; i++) {
			var plane1 = ((i >> 0) & 1) | ((i >> 1) & 2) | ((i >> 2) & 4) | ((i >> 3) & 8);
			var plane2 = ((i >> 1) & 1) | ((i >> 2) & 2) | ((i >> 3) & 4) | ((i >> 4) & 8);

			dblpf_2nd1[i] = plane1 == 0 && plane2 != 0;
			dblpf_2nd2[i] = plane2 != 0;

/*#ifdef AGA
			dblpf_ind1_aga[i] = plane1 == 0 ? plane2 : plane1;
			dblpf_ind2_aga[i] = plane2 == 0 ? plane1 : plane2;
#endif*/
			dblpf_ms1[i] = plane1 == 0 ? (plane2 == 0 ? 16 : 8) : 0;
			dblpf_ms2[i] = plane2 == 0 ? (plane1 == 0 ? 16 : 0) : 8;
			dblpf_ms[i] = i == 0 ? 16 : 8;

			if (plane2 > 0)
				plane2 += 8;
			dblpf_ind1[i] = i >= 128 ? i & 0x7F : (plane1 == 0 ? plane2 : plane1);
			dblpf_ind2[i] = i >= 128 ? i & 0x7F : (plane2 == 0 ? plane1 : plane2);
		}
	}

	this.recreate_aspect_maps = function () {
		var i, h = gfxvidinfo.drawbuffer.height_allocated;
		if (h == 0)
			return;

		linedbld = linedbl = AMIGA.config.video.vresolution;
		if (doublescan > 0 && interlace_seen <= 0) {
			linedbl = 0;
			linedbld = 1;
		}

		amiga2aspect_line_map = new Int32Array((MAXVPOS + 1) * 2 + 1);
		native2amiga_line_map = new Int32Array(h);

		var maxl = (MAXVPOS + 1) << linedbld;
		min_ypos_for_screen = minfirstline << linedbl;
		max_drawn_amiga_line = -1;
		for (i = 0; i < maxl; i++) {
			var v = i - min_ypos_for_screen;
			if (v >= h && max_drawn_amiga_line < 0)
				max_drawn_amiga_line = i - min_ypos_for_screen;
			if (i < min_ypos_for_screen || v >= h)
				v = -1;
			amiga2aspect_line_map[i] = v;
		}
		if (max_drawn_amiga_line < 0)
			max_drawn_amiga_line = maxl - min_ypos_for_screen;
		max_drawn_amiga_line >>>= linedbl;

		if (AMIGA.config.video.ycenter) {
			extra_y_adjust = (h - (this.maxvpos_nom << linedbl)) >> 1;
			if (extra_y_adjust < 0)
				extra_y_adjust = 0;
		}

		for (i = 0; i < h; i++)
			native2amiga_line_map[i] = -1;

		for (i = maxl - 1; i >= min_ypos_for_screen; i--) {
			if (amiga2aspect_line_map[i] == -1)
				continue;
			for (var j = amiga2aspect_line_map[i]; j < h && native2amiga_line_map[j] == -1; j++)
				native2amiga_line_map[j] = i >> linedbl;
		}

		gfxvidinfo.xchange = 1 << (RES_MAX - AMIGA.config.video.hresolution);
		gfxvidinfo.ychange = linedbl ? 1 : 2;

		visible_left_start = 0;
		visible_right_stop = MAX_STOP;
		visible_top_start = 0;
		visible_bottom_stop = MAX_STOP;
		//console.log('recreate_aspect_maps', amiga2aspect_line_map, native2amiga_line_map);
	};	
		
	/*---------------------------------*/

	function xlinecheck(id, start, end) {
		var xstart =  start * gfxvidinfo.drawbuffer.pixbytes;
		var xend = end * gfxvidinfo.drawbuffer.pixbytes;
		var end1 = gfxvidinfo.drawbuffer.rowbytes * gfxvidinfo.drawbuffer.height;
		var min = Math.floor(linetoscr_x_adjust_bytes / gfxvidinfo.drawbuffer.pixbytes);
		var ok = 1;

		if (xend > end1 || xstart >= end1)
			ok = 0;
		if ((xstart % gfxvidinfo.drawbuffer.rowbytes) >= gfxvidinfo.drawbuffer.width * gfxvidinfo.drawbuffer.pixbytes)
			ok = 0;
		if ((xend % gfxvidinfo.drawbuffer.rowbytes) >= gfxvidinfo.drawbuffer.width * gfxvidinfo.drawbuffer.pixbytes)
			ok = 0;
		if (xstart >= xend)
			ok = 0;
		if (xend - xstart > gfxvidinfo.drawbuffer.width * gfxvidinfo.drawbuffer.pixbytes)
			ok = 0;

		if (!ok) {
			console.log(id, start, end, min);
			BUG.info('xlinecheck() ERROR %d-%d (%dx%dx%d %d)', 
				start - min, end - min, gfxvidinfo.drawbuffer.width, gfxvidinfo.drawbuffer.height,
				gfxvidinfo.drawbuffer.pixbytes, gfxvidinfo.drawbuffer.rowbytes);
		}
	}	

	/*---------------------------------*/

	function max_diwlastword() { 
		return (0x1d4 - DISPLAY_LEFT_SHIFT + DIW_DDF_OFFSET - 1) << lores_shift;
	}

 	function xshift(x, shift) {
		return shift < 0 ? x >> (-shift) : x << shift;
	}

	function coord_hw_to_window_x(x) {
		return (x - DISPLAY_LEFT_SHIFT) << lores_shift;
	}
	function coord_window_to_hw_x(x) {
		return (x >> lores_shift) + DISPLAY_LEFT_SHIFT;
	}

	function coord_diw_to_window_x(x) {
		return (x - DISPLAY_LEFT_SHIFT + DIW_DDF_OFFSET - 1) << lores_shift;
	}
	function coord_window_to_diw_x(x) {
		return (x >> lores_shift) + DISPLAY_LEFT_SHIFT - DIW_DDF_OFFSET;
	}	
	
	/*function coord_native_to_amiga_x(x) {
		return xshift(x + visible_left_border, 1 - lores_shift) + 2 * DISPLAY_LEFT_SHIFT - 2 * DIW_DDF_OFFSET;	
	}
	function coord_native_to_amiga_y(y) {
		return native2amiga_line_map[y] + thisframe_y_adjust - minfirstline;
	}*/

	function res_shift_from_window(x) {
		return res_shift >= 0 ? x >> res_shift : x << -res_shift;
	}
	/*function res_shift_from_amiga(x) {
		return res_shift >= 0 ? x >> res_shift : x << -res_shift;
	}*/
	
	/*---------------------------------*/   
	
	this.render_screen = function (immediate) {
		if (AMIGA.config.video.enabled)
			AMIGA.video.render();
		return true;
	};
	this.show_screen = function () {
		if (AMIGA.config.video.enabled)
			AMIGA.video.show(); //flip
		return true;
	};
	
	/*function flush_line(vb, lineno) {
		AMIGA.video.drawline(lineno, xlinebuffer, linetoscr_x_adjust_bytes >> 2);
	}	
	function flush_block(vb, first_line, last_line) {
		console.log('flush_block() called', first_line, last_line);				
	}			
	function flush_screen(vb, first_line, last_line) {
		console.log('flush_screen() called', first_line, last_line);				
	}
	this.do_flush_line = function(vb, lineno) {
		if (lineno < first_drawn_line)
			first_drawn_line = lineno;
		if (lineno > last_drawn_line)
			last_drawn_line = lineno;

		if (gfxvidinfo.maxblocklines == 0)
			flush_line(vb, lineno);
		else {
			if ((last_block_line + 2) < lineno) {
				if (first_block_line != NO_BLOCK)
					flush_block(vb, first_block_line, last_block_line);
				first_block_line = lineno;
			}
			last_block_line = lineno;
			if (last_block_line - first_block_line >= gfxvidinfo.maxblocklines) {
				flush_block(vb, first_block_line, last_block_line);
				first_block_line = last_block_line = NO_BLOCK;
			}
		}
	}*/
	
	this.do_flush_line = function (vb, lineno) {
		if (lineno < first_drawn_line)
			first_drawn_line = lineno;
		if (lineno > last_drawn_line)
			last_drawn_line = lineno;

		AMIGA.video.drawline(lineno, xlinebuffer, linetoscr_x_adjust_bytes >> 2);
	};

	/*this.do_flush_screen = function(vb, start, stop) {	
		if (gfxvidinfo.maxblocklines != 0 && first_block_line != NO_BLOCK)
			flush_block(vb, first_block_line, last_block_line);
		if (start <= stop)
			flush_screen(vb, start, stop);
	}*/
	
	/*---------------------------------*/   
		
	function is_ehb(con0, con2) {
		if (AMIGA.config.chipset.mask & CSMASK_AGA)
			return ((con0 & 0x7010) == 0x6000);
		if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)
			return ((con0 & 0xFC00) == 0x6000 || (con0 & 0xFC00) == 0x7000);

		return ((con0 & 0xFC00) == 0x6000 || (con0 & 0xFC00) == 0x7000);// && !currprefs.cs_denisenoehb;
	}	
	
	function is_ham(con0) {
		var p = GET_PLANES(con0);
		if (!(con0 & 0x800))
			return false;
		if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			// AGA only has 6 or 8 plane HAM
			if (p == 6 || p == 8)
				return true;
		} else {
			// OCS/ECS also supports 5 plane HAM
			if (GET_RES_DENISE(con0) > 0)
				return 0;
			if (p >= 5)
				return true;
		}
		return false;
	}	
	
	/*function get_sprite_mask() {
		var hi = new Uint64(0x00000000,0xFFFF0000);
		hi.lshift(4 * plf2pri);
		var lo = new Uint64(0x00000000,0x0000FFFF);
		lo.lshift(4 * plf1pri);
		hi.or(lo);
		return hi;
	}*/	
	
	this.pfield_expand_dp_bplcon = function () {
		bplres = dp_for_drawing.bplres;
		bplplanecnt = dp_for_drawing.nr_planes;
		bplham = dp_for_drawing.ham_seen;
		bplehb = dp_for_drawing.ehb_seen;
		if ((AMIGA.config.chipset.mask & CSMASK_AGA) && (dp_for_drawing.bplcon2 & 0x0200))
			bplehb = 0;
		issprites = dip_for_drawing.nr_sprites;
		ecsshres = bplres == RES_SUPERHIRES && (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && !(AMIGA.config.chipset.mask & CSMASK_AGA);

		plf1pri = dp_for_drawing.bplcon2 & 7;
		plf2pri = (dp_for_drawing.bplcon2 >> 3) & 7;
		plf_sprite_mask = 0xFFFF0000 << (4 * plf2pri);
		plf_sprite_mask |= (0x0000FFFF << (4 * plf1pri)) & 0xFFFF;
		plf_sprite_mask >>>= 0;
		//plf_sprite_mask = get_sprite_mask();	

		bpldualpf = (dp_for_drawing.bplcon0 & 0x400) == 0x400;
		bpldualpfpri = (dp_for_drawing.bplcon2 & 0x40) == 0x40;

		/*#ifdef AGA
		 bpldualpf2of = (dp_for_drawing.bplcon3 >> 10) & 7;
		 sbasecol[0] = ((dp_for_drawing.bplcon4 >> 4) & 15) << 4;
		 sbasecol[1] = ((dp_for_drawing.bplcon4 >> 0) & 15) << 4;
		 brdsprt = !brdblank && (AMIGA.config.chipset.mask & CSMASK_AGA) && (dp_for_drawing.bplcon0 & 1) && (dp_for_drawing.bplcon3 & 0x02);
		 bplxor = dp_for_drawing.bplcon4 >> 8;
		 #endif*/
	};

	this.pfield_expand_dp_bplconx = function (regno, v) {
		if (regno == 0xffff) {
			//hposblank = 1; //FIXME
			return;
		}
		regno -= 0x1000;
		switch (regno) {
			case 0x100:
				dp_for_drawing.bplcon0 = v;
				dp_for_drawing.bplres = GET_RES_DENISE(v);
				dp_for_drawing.nr_planes = GET_PLANES(v);
				dp_for_drawing.ham_seen = is_ham(v);
				break;
			case 0x104:
				dp_for_drawing.bplcon2 = v;
				break;
			case 0x106:
				dp_for_drawing.bplcon3 = v;
				break;
			/*#ifdef AGA
			 case 0x10c:
			 dp_for_drawing.bplcon4 = v;
			 break;
			 #endif*/
		}
		this.pfield_expand_dp_bplcon();
		res_shift = lores_shift - bplres;
	};	
		
	this.center_image = function () {
		var prev_x_adjust = visible_left_border;
		var prev_y_adjust = thisframe_y_adjust;
		var tmp;

		var w = gfxvidinfo.drawbuffer.inwidth;
		if (AMIGA.config.video.xcenter && max_diwstop > 0) {
			if (max_diwstop - min_diwstart < w && AMIGA.config.video.xcenter == 2)
			/* Try to center. */
				visible_left_border = ((max_diwstop - min_diwstart - w) >> 1) + min_diwstart;
			else
				visible_left_border = max_diwstop - w - ((max_diwstop - min_diwstart - w) >> 1);
			visible_left_border &= ~((xshift(1, lores_shift)) - 1);

			/* Would the old value be good enough? If so, leave it as it is if we want to be clever. */
			if (AMIGA.config.video.xcenter == 2) {
				if (center_reset || (visible_left_border < prev_x_adjust && prev_x_adjust < min_diwstart && min_diwstart - visible_left_border <= 32))
					visible_left_border = prev_x_adjust;
			}
		} else if (gfxvidinfo.drawbuffer.extrawidth) {
			visible_left_border = max_diwlastword() - w;
			if (gfxvidinfo.drawbuffer.extrawidth > 0)
				visible_left_border += gfxvidinfo.drawbuffer.extrawidth << AMIGA.config.video.hresolution;
		} else {
			if (gfxvidinfo.drawbuffer.inxoffset < 0) {
				visible_left_border = 0;
			} else {
				visible_left_border = gfxvidinfo.drawbuffer.inxoffset - DISPLAY_LEFT_SHIFT;
			}
		}

		if (visible_left_border > max_diwlastword() - 32)
			visible_left_border = max_diwlastword() - 32;
		if (visible_left_border < 0)
			visible_left_border = 0;
		visible_left_border &= ~((xshift(1, lores_shift)) - 1);

		linetoscr_x_adjust_bytes = visible_left_border * gfxvidinfo.drawbuffer.pixbytes;

		visible_right_border = visible_left_border + w;
		if (visible_right_border > max_diwlastword())
			visible_right_border = max_diwlastword();

		thisframe_y_adjust = minfirstline;
		if (AMIGA.config.video.ycenter && thisframe_first_drawn_line >= 0) {
			if (thisframe_last_drawn_line - thisframe_first_drawn_line < max_drawn_amiga_line && AMIGA.config.video.ycenter == 2)
				thisframe_y_adjust = ((thisframe_last_drawn_line - thisframe_first_drawn_line - max_drawn_amiga_line) >> 1) + thisframe_first_drawn_line;
			else
				thisframe_y_adjust = thisframe_first_drawn_line + (((thisframe_last_drawn_line - thisframe_first_drawn_line) - max_drawn_amiga_line) >> 1);

			if (AMIGA.config.video.ycenter == 2) {
				if (center_reset || (thisframe_y_adjust != prev_y_adjust
					&& prev_y_adjust <= thisframe_first_drawn_line
					&& prev_y_adjust + max_drawn_amiga_line > thisframe_last_drawn_line))
					thisframe_y_adjust = prev_y_adjust;
			}
		}
		if (thisframe_y_adjust + max_drawn_amiga_line > this.maxvpos_nom)
			thisframe_y_adjust = this.maxvpos_nom - max_drawn_amiga_line;
		if (thisframe_y_adjust < minfirstline)
			thisframe_y_adjust = minfirstline;

		thisframe_y_adjust_real = thisframe_y_adjust << linedbl;
		tmp = (this.maxvpos_nom - thisframe_y_adjust + 1) << linedbl;
		if (tmp != max_ypos_thisframe) {
			last_max_ypos = tmp;
			if (last_max_ypos < 0)
				last_max_ypos = 0;
		}
		max_ypos_thisframe = tmp;

		if (prev_x_adjust != visible_left_border || prev_y_adjust != thisframe_y_adjust)
			frame_redraw_necessary |= (interlace_seen > 0 && linedbl) ? 2 : 1;

		max_diwstop = 0;
		min_diwstart = MAX_STOP;

		gfxvidinfo.drawbuffer.xoffset = (DISPLAY_LEFT_SHIFT << RES_MAX) + (visible_left_border << (RES_MAX - AMIGA.config.video.hresolution));
		gfxvidinfo.drawbuffer.yoffset = thisframe_y_adjust << VRES_MAX;

		center_reset = false;
	};	
				
	/*---------------------------------*/   

	const COLOR_MATCH_ACOLORS = 1;  
	const COLOR_MATCH_FULL = 2;   
	var color_match_type = 0;
	
	this.adjust_drawing_colors = function (ctable, need_full) {
		if (FAST_COLORS) {
			if (need_full)
				color_reg_cpy(colors_for_drawing, current_colors);
			else
				color_reg_cpy_acolors(colors_for_drawing, current_colors);
			return;
		}
		if (drawing_color_matches != ctable) {
			if (need_full) {
				color_reg_cpy(colors_for_drawing, curr_color_tables[ctable]);
				color_match_type = COLOR_MATCH_FULL;
			} else {
				//memcpy (colors_for_drawing.acolors, curr_color_tables[ctable].acolors, sizeof colors_for_drawing.acolors);
				//for (var i = 0; i < colors_for_drawing.acolors.length; i++) colors_for_drawing.acolors[i] = curr_color_tables[ctable].acolors[i];	colors_for_drawing.borderblank = curr_color_tables[ctable].borderblank;
				color_reg_cpy_acolors(colors_for_drawing, curr_color_tables[ctable]);
				color_match_type = COLOR_MATCH_ACOLORS;
			}
			drawing_color_matches = ctable;
		}
		else if (need_full && color_match_type != COLOR_MATCH_FULL) {
			color_reg_cpy(colors_for_drawing, curr_color_tables[ctable]);
			color_match_type = COLOR_MATCH_FULL;
		}
	};
	
	this.do_color_changes = function (worker_border, worker_pfield, vp) {
		var lastpos = visible_left_border;
		var endpos = visible_left_border + gfxvidinfo.drawbuffer.inwidth;

		for (var i = dip_for_drawing.first_color_change; i <= dip_for_drawing.last_color_change; i++) {
			var regno = curr_color_changes[i].regno;
			var value = curr_color_changes[i].value;
			var nextpos, nextpos_in_range;

			if (i == dip_for_drawing.last_color_change)
				nextpos = endpos;
			else
				nextpos = coord_hw_to_window_x(curr_color_changes[i].linepos);

			nextpos_in_range = nextpos;
			if (nextpos > endpos)
				nextpos_in_range = endpos;

			if (nextpos_in_range > lastpos) {
				if (lastpos < playfield_start) {
					var t = nextpos_in_range <= playfield_start ? nextpos_in_range : playfield_start;
					worker_border(lastpos, t, false);
					lastpos = t;
				}
			}
			if (nextpos_in_range > lastpos) {
				if (lastpos >= playfield_start && lastpos < playfield_end) {
					var t = nextpos_in_range <= playfield_end ? nextpos_in_range : playfield_end;
					worker_pfield(lastpos, t, false);
					// blank start and end that shouldn't be visible 
					if (lastpos < visible_left_start)
						worker_border(lastpos, visible_left_start, true);
					if (t > visible_right_stop)
						worker_border(visible_right_stop, endpos, true);
					lastpos = t;
				}
			}
			if (nextpos_in_range > lastpos) {
				if (lastpos >= playfield_end)
					worker_border(lastpos, nextpos_in_range, false);
				lastpos = nextpos_in_range;
			}

			if (regno >= 0x1000)
				this.pfield_expand_dp_bplconx(regno, value);
			else if (regno >= 0) {
				if (regno == 0 && (value & COLOR_CHANGE_BRDBLANK))
					colors_for_drawing.borderblank = (value & 1) != 0;
				else {
					color_reg_set(colors_for_drawing, regno, value);
					colors_for_drawing.acolors[regno] = getxcolor(value);
				}
			}
			if (lastpos >= endpos)
				break;
		}
		if (vp < visible_top_start || vp >= visible_bottom_stop) {
			// outside of visible area
			// Just overwrite with black. Above code needs to run because of custom registers,
			// not worth the trouble for separate code path just for max 10 lines or so
			worker_border(visible_left_border, visible_left_border + gfxvidinfo.drawbuffer.inwidth, true);
		}
	};
	
	/*---------------------------------*/   
	
	function getbgc(blank) {
/*#if 0
		if (blank)
			return xcolors[0x088];
		else if (hposblank == 1)
			return xcolors[0xf00];
		else if (hposblank == 2)
			return xcolors[0x0f0];
		else if (hposblank == 3)
			return xcolors[0x00f];
		else if (brdblank)
			return xcolors[0x880];
		//return colors_for_drawing.acolors[0];
		return xcolors[0xf0f];
#endif*/
		return (blank || hposblank || colors_for_drawing.borderblank) ? 0 : colors_for_drawing.acolors[0];
	}

	function fill_line_16(buf, start, stop, blank) {
		console.log('fill_line_16() NI', start, stop, blank);
		/*uae_u16 *b = (uae_u16 *)buf;
		var rem = 0;
		var col = getbgc(blank);
		
		if (((long)&b[start]) & 1)
			b[start++] = (uae_u16) col;
			
		if (start >= stop)
			return;
			
		if (((long)&b[stop]) & 1) {
			rem++;
			stop--;
		}
		for (var i = start; i < stop; i += 2) {
			uae_u32 *b2 = (uae_u32 *)&b[i];
			*b2 = col;
		}
		if (rem)
			b[stop] = (uae_u16)col;*/
	}
	function fill_line_32(buf, start, stop, blank) {
		var col = getbgc(blank);
		for (var i = start; i < stop; i++)
			buf[i] = col;
	}	

	function pfield_do_fill_line2(start, stop, blank) {
		switch (gfxvidinfo.drawbuffer.pixbytes) {
			case 2: fill_line_16(xlinebuffer, start, stop, blank); break;
			case 4: fill_line_32(xlinebuffer, start, stop, blank); break;
		}
	}
	function pfield_do_fill_line(start, stop, blank) {
		//console.log('pfield_do_fill_line()', start, stop, blank);
		//xlinecheck('pfield_do_fill_line', start, stop);
		if (!blank) {
			if (start < visible_left_start) {
				pfield_do_fill_line2(start, visible_left_start, true);
				start = visible_left_start;
			}
			if (stop > visible_right_stop) {
				pfield_do_fill_line2(start, visible_right_stop, false);
				blank = true;
				start = visible_right_stop;
			}
		}
		pfield_do_fill_line2(start, stop, blank);
	}
		
	function fill_line2(startpos, len) {
		//console.log('fill_line2', startpos, len);
		/*var shift = 0;
		if (gfxvidinfo.drawbuffer.pixbytes == 2) shift = 1;
		if (gfxvidinfo.drawbuffer.pixbytes == 4) shift = 2;*/

		var nints = len;// >> (2 - shift);
		var nrem = nints & 7;
		nints &= ~7;
		//int *start = (int *)(((uae_u8*)xlinebuffer) + (startpos << shift));
		var start = startpos;// << shift >> 2;
		var val = getbgc(false);
		
		/*for (; nints > 0; nints -= 8, start += 8) {
			*start = val;
			*(start+1) = val;
			*(start+2) = val;
			*(start+3) = val;
			*(start+4) = val;
			*(start+5) = val;
			*(start+6) = val;
			*(start+7) = val;
		}
		switch (nrem) {
			case 7: *start++ = val;
			case 6: *start++ = val;
			case 5: *start++ = val;
			case 4: *start++ = val;
			case 3: *start++ = val;
			case 2: *start++ = val;
			case 1: *start = val;
		}*/
		
		for (; nints > 0; nints -= 8, start += 8) {
			xlinebuffer[start    ] = val;
			xlinebuffer[start + 1] = val;
			xlinebuffer[start + 2] = val;
			xlinebuffer[start + 3] = val;
			xlinebuffer[start + 4] = val;
			xlinebuffer[start + 5] = val;
			xlinebuffer[start + 6] = val;
			xlinebuffer[start + 7] = val;
		}
		switch (nrem) {
			case 7: xlinebuffer[start++] = val;
			case 6: xlinebuffer[start++] = val;
			case 5: xlinebuffer[start++] = val;
			case 4: xlinebuffer[start++] = val;
			case 3: xlinebuffer[start++] = val;
			case 2: xlinebuffer[start++] = val;
			case 1: xlinebuffer[start] = val;
		}
	}	
	function fill_line() {
		var hs = coord_hw_to_window_x(hsyncstartpos * 2);
		if (hs >= gfxvidinfo.drawbuffer.inwidth || hposblank) {
			//hposblank = 3; //FIXME
			fill_line2(visible_left_border, gfxvidinfo.drawbuffer.inwidth);
		} else {
			fill_line2(visible_left_border, hs);
			//hposblank = 2; //FIXME
			fill_line2(visible_left_border + hs, gfxvidinfo.drawbuffer.inwidth);
		}			
	}	

	/*---------------------------------*/   
		
	this.pfield_init_linetoscr = function () {
		var ddf_left = dp_for_drawing.plfleft * 2 + DIW_DDF_OFFSET;
		var ddf_right = dp_for_drawing.plfright * 2 + DIW_DDF_OFFSET;

		native_ddf_left = coord_hw_to_window_x(ddf_left);
		native_ddf_right = coord_hw_to_window_x(ddf_right);

		linetoscr_diw_start = dp_for_drawing.diwfirstword;
		linetoscr_diw_end = dp_for_drawing.diwlastword;

		res_shift = lores_shift - bplres;

		if (dip_for_drawing.nr_sprites == 0) {
			if (linetoscr_diw_start < native_ddf_left)
				linetoscr_diw_start = native_ddf_left;
			if (linetoscr_diw_end > native_ddf_right)
				linetoscr_diw_end = native_ddf_right;
		}
		if (linetoscr_diw_end < linetoscr_diw_start)
			linetoscr_diw_end = linetoscr_diw_start;

		playfield_start = linetoscr_diw_start;
		playfield_end = linetoscr_diw_end;

		unpainted = visible_left_border < playfield_start ? 0 : visible_left_border - playfield_start;
		ham_src_pixel = MAX_PIXELS_PER_LINE + res_shift_from_window(playfield_start - native_ddf_left);
		unpainted = res_shift_from_window(unpainted);

		if (playfield_start < visible_left_border)
			playfield_start = visible_left_border;
		if (playfield_start > visible_right_border)
			playfield_start = visible_right_border;
		if (playfield_end < visible_left_border)
			playfield_end = visible_left_border;
		if (playfield_end > visible_right_border)
			playfield_end = visible_right_border;

		real_playfield_end = playfield_end;
		real_playfield_start = playfield_start;

		/*#ifdef AGA
		 if (brdsprt && dip_for_drawing.nr_sprites) {
		 var min = visible_right_border, max = visible_left_border, i;
		 for (i = 0; i < dip_for_drawing.nr_sprites; i++) {
		 var x;
		 x = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i].pos;
		 if (x < min)
		 min = x;
		 x = curr_sprite_entries[dip_for_drawing.first_sprite_entry + i].max;
		 if (x > max)
		 max = x;
		 }
		 min = coord_hw_to_window_x (min >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
		 max = coord_hw_to_window_x (max >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
		 if (min < playfield_start)
		 playfield_start = min;
		 if (playfield_start < visible_left_border)
		 playfield_start = visible_left_border;
		 if (max > playfield_end)
		 playfield_end = max;
		 if (playfield_end > visible_right_border)
		 playfield_end = visible_right_border;
		 }
		 #endif*/

		if (sprite_first_x < sprite_last_x) {
			if (sprite_first_x < 0)
				sprite_first_x = 0;
			if (sprite_last_x >= MAX_PIXELS_PER_LINE - 1)
				sprite_last_x = MAX_PIXELS_PER_LINE - 2;
			if (sprite_first_x < sprite_last_x) {
				//memset (spritepixels + sprite_first_x, 0, sizeof (struct SpritePixelsBuf) * (sprite_last_x - sprite_first_x + 1));
				for (var i = sprite_first_x; i <= sprite_last_x; i++) {
					spritepixels[i].clr();
				}
			}
		}
		sprite_last_x = 0;
		sprite_first_x = MAX_PIXELS_PER_LINE - 1;

		ddf_left -= DISPLAY_LEFT_SHIFT;
		pixels_offset = MAX_PIXELS_PER_LINE - (ddf_left << bplres);
		//ddf_left <<= bplres;
		src_pixel = MAX_PIXELS_PER_LINE + res_shift_from_window(playfield_start - native_ddf_left);

		if (dip_for_drawing.nr_sprites == 0)
			return;

		/* Must clear parts of apixels.  */
		if (linetoscr_diw_start < native_ddf_left) {
			var size = res_shift_from_window(native_ddf_left - linetoscr_diw_start);
			linetoscr_diw_start = native_ddf_left;
			//memset (apixels + MAX_PIXELS_PER_LINE - size, 0, size);
			for (var i = 0; i < size; i++) {
				apixels[MAX_PIXELS_PER_LINE - size + i] = 0;
			}
		}
		if (linetoscr_diw_end > native_ddf_right) {
			var pos = res_shift_from_window(native_ddf_right - native_ddf_left);
			var size = res_shift_from_window(linetoscr_diw_end - native_ddf_right);
			linetoscr_diw_start = native_ddf_left;
			//memset (apixels + MAX_PIXELS_PER_LINE + pos, 0, size);
			for (var i = 0; i < size; i++) {
				apixels[MAX_PIXELS_PER_LINE + pos + i] = 0;
			}
		}
	};	
		
	function dummy_worker(start, stop, blank) { }
	
	
	function linetoscr_32(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		}

		return spix;
	}
	
	function linetoscr_32_stretch1(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		}
		return spix;
	}
	
	function linetoscr_32_shrink1(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				xlinebuffer[dpix++] = out_val;
			}
		}
		return spix;
	}	
	
	
	function linetoscr_32_spr(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
		var sprcol;

		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var sprpix_val;
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				sprpix_val = dpix_val;
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 1, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		}

		return spix;
	}	

	function linetoscr_32_stretch1_spr(spix, dpix, stoppos) {
		//uae_u32 *buf = (uae_u32 *) xlinebuffer;
		var sprcol;

		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var sprpix_val;
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				sprpix_val = dpix_val;
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 1, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix++;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
				xlinebuffer[dpix++] = out_val;
			}
		}
		return spix;
	}

	function linetoscr_32_shrink1_spr(spix, dpix, stoppos) {
		//var *buf = (var *) xlinebuffer;
		var sprcol;

		if (dp_for_drawing.ham_seen) {
			while (dpix < stoppos) {
				var sprpix_val;
				var dpix_val;
				var out_val;

				dpix_val = xcolors[ham_linebuf[spix]];
				sprpix_val = dpix_val;
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bpldualpf) {
			var lookup = bpldualpfpri ? dblpf_ind2 : dblpf_ind1;
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[lookup[spix_val]];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 1, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else if (bplehb) {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				if (spix_val <= 31)
					dpix_val = colors_for_drawing.acolors[spix_val];
				else
					dpix_val = xcolors[(colors_for_drawing.color_regs_ecs[spix_val - 32] >> 1) & 0x777];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		} else {
			while (dpix < stoppos) {
				var sprpix_val;
				var spix_val;
				var dpix_val;
				var out_val;

				spix_val = apixels[spix];
				sprpix_val = spix_val;
				dpix_val = colors_for_drawing.acolors[spix_val];
				spix += 2;
				out_val = dpix_val;
				if (spritepixels[dpix].data) {
					sprcol = render_sprites (dpix, 0, sprpix_val, 0);
					if (sprcol) {
						out_val = colors_for_drawing.acolors[sprcol];
					}
				}
				xlinebuffer[dpix++] = out_val;
			}
		}

		return spix;
	}
	

	//apixels -> xlinebuffer	
	function pfield_do_linetoscr(start, stop, blank) { 		
		//console.log('pfield_do_linetoscr()', start, stop, stop - start);
		//xlinecheck('pfield_do_linetoscr', start, stop);
		
/*#ifdef AGA		
		if (issprites && (AMIGA.config.chipset.mask & CSMASK_AGA)) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_aga_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_aga_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2_aga_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2_aga_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1_aga_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1_aga_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1f_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1f_aga_spr (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1_aga_spr (src_pixel, start, stop); break;
					}
				}
			} else if (res_shift == -2) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2f_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2f_aga_spr (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2_aga_spr (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2_aga_spr (src_pixel, start, stop); break;
					}
				}
			}
		} else if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_aga (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_aga (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2_aga (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2_aga (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1_aga (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1_aga (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1f_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1f_aga (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink1_aga (src_pixel, start, stop); break;
					}
				}
			} else if (res_shift == -2) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2f_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2f_aga (src_pixel, start, stop); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2_aga (src_pixel, start, stop); break;
						case 4: src_pixel = linetoscr_32_shrink2_aga (src_pixel, start, stop); break;
					}
				}
			}
		} else
#endif*/

/*#ifdef ECS_DENISE
		if (ecsshres) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_sh (src_pixel, start, stop, issprites); break;
					case 4: src_pixel = linetoscr_32_sh (src_pixel, start, stop, issprites); break;
				}
			} else if (res_shift == -1) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1f_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink1f_sh (src_pixel, start, stop, issprites); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink1_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink1_sh (src_pixel, start, stop, issprites); break;
					}
				}
			} else if (res_shift == -2) {
				if (currprefs.gfx_lores_mode) {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2f_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink2f_sh (src_pixel, start, stop, issprites); break;
					}
				} else {
					switch (gfxvidinfo.drawbuffer.pixbytes) {
						case 2: src_pixel = linetoscr_16_shrink2_sh (src_pixel, start, stop, issprites); break;
						case 4: src_pixel = linetoscr_32_shrink2_sh (src_pixel, start, stop, issprites); break;
					}
				}
			}
		} else
#endif*/

		if (issprites) {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1_spr (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_shrink1_spr (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_shrink1_spr (src_pixel, start, stop); break;
				}
			}
		} else {
			if (res_shift == 0) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32 (src_pixel, start, stop); break;
				}
			} else if (res_shift == 2) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch2 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch2 (src_pixel, start, stop); break;
				}
			} else if (res_shift == 1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_stretch1 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_stretch1 (src_pixel, start, stop); break;
				}
			} else if (res_shift == -1) {
				switch (gfxvidinfo.drawbuffer.pixbytes) {
					case 2: src_pixel = linetoscr_16_shrink1 (src_pixel, start, stop); break;
					case 4: src_pixel = linetoscr_32_shrink1 (src_pixel, start, stop); break;
				}
			}
		}		
	}
	
	function init_ham_decoding() {
		var unpainted_amiga = unpainted;

		ham_decode_pixel = ham_src_pixel;
		ham_lastcolor = color_reg_get(colors_for_drawing, 0);

		if (!bplham) {
			if (unpainted_amiga > 0) {
				var pv = apixels[ham_decode_pixel + unpainted_amiga - 1];
/*#ifdef AGA
				if (currprefs.chipset_mask & CSMASK_AGA)
					ham_lastcolor = colors_for_drawing.color_regs_aga[pv ^ bplxor];
				else
#endif*/
				ham_lastcolor = colors_for_drawing.color_regs_ecs[pv];
			}
/*#ifdef AGA
		} else if (currprefs.chipset_mask & CSMASK_AGA) {
			if (bplplanecnt >= 7) { // AGA mode HAM8
				while (unpainted_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel++] ^ bplxor;
					switch (pv & 0x3) {
						case 0x0: ham_lastcolor = colors_for_drawing.color_regs_aga[pv >> 2]; break;
						case 0x1: ham_lastcolor &= 0xFFFF03; ham_lastcolor |= (pv & 0xFC); break;
						case 0x2: ham_lastcolor &= 0x03FFFF; ham_lastcolor |= (pv & 0xFC) << 16; break;
						case 0x3: ham_lastcolor &= 0xFF03FF; ham_lastcolor |= (pv & 0xFC) << 8; break;
					}
				}
			} else { // AGA mode HAM6
				while (unpainted_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel++] ^ bplxor;
					switch (pv & 0x30) {
						case 0x00: ham_lastcolor = colors_for_drawing.color_regs_aga[pv]; break;
						case 0x10: ham_lastcolor &= 0xFFFF00; ham_lastcolor |= (pv & 0xF) << 4; break;
						case 0x20: ham_lastcolor &= 0x00FFFF; ham_lastcolor |= (pv & 0xF) << 20; break;
						case 0x30: ham_lastcolor &= 0xFF00FF; ham_lastcolor |= (pv & 0xF) << 12; break;
					}
				}
			}
#endif*/
		} else {
			/* OCS/ECS mode HAM6 */
			while (unpainted_amiga-- > 0) {
				var pv = apixels[ham_decode_pixel++];
				switch (pv & 0x30) {
					case 0x00: ham_lastcolor = colors_for_drawing.color_regs_ecs[pv]; break;
					case 0x10: ham_lastcolor &= 0xFF0; ham_lastcolor |= (pv & 0xF); break;
					case 0x20: ham_lastcolor &= 0x0FF; ham_lastcolor |= (pv & 0xF) << 8; break;
					case 0x30: ham_lastcolor &= 0xF0F; ham_lastcolor |= (pv & 0xF) << 4; break;
				}
			}
		}
	}

	function decode_ham(pix, stoppos, blank) {
		var todraw_amiga = res_shift_from_window(stoppos - pix);

		if (!bplham) {
			while (todraw_amiga-- > 0) {
				var pv = apixels[ham_decode_pixel];
/*#ifdef AGA
				if (currprefs.chipset_mask & CSMASK_AGA)
					ham_lastcolor = colors_for_drawing.color_regs_aga[pv ^ bplxor];
				else
#endif*/
					ham_lastcolor = colors_for_drawing.color_regs_ecs[pv];

				ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
			}
/*#ifdef AGA
		} else if (currprefs.chipset_mask & CSMASK_AGA) {
			if (bplplanecnt >= 7) { // AGA mode HAM8
				while (todraw_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel] ^ bplxor;
					switch (pv & 0x3) {
						case 0x0: ham_lastcolor = colors_for_drawing.color_regs_aga[pv >> 2]; break;
						case 0x1: ham_lastcolor &= 0xFFFF03; ham_lastcolor |= (pv & 0xFC); break;
						case 0x2: ham_lastcolor &= 0x03FFFF; ham_lastcolor |= (pv & 0xFC) << 16; break;
						case 0x3: ham_lastcolor &= 0xFF03FF; ham_lastcolor |= (pv & 0xFC) << 8; break;
					}
					ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
				}
			} else { // AGA mode HAM6
				while (todraw_amiga-- > 0) {
					var pv = apixels[ham_decode_pixel] ^ bplxor;
					switch (pv & 0x30) {
						case 0x00: ham_lastcolor = colors_for_drawing.color_regs_aga[pv]; break;
						case 0x10: ham_lastcolor &= 0xFFFF00; ham_lastcolor |= (pv & 0xF) << 4; break;
						case 0x20: ham_lastcolor &= 0x00FFFF; ham_lastcolor |= (pv & 0xF) << 20; break;
						case 0x30: ham_lastcolor &= 0xFF00FF; ham_lastcolor |= (pv & 0xF) << 12; break;
					}
					ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
				}
			}
#endif*/
		} else {
			/* OCS/ECS mode HAM6 */
			while (todraw_amiga-- > 0) {
				var pv = apixels[ham_decode_pixel];
				switch (pv & 0x30) {
					case 0x00: ham_lastcolor = colors_for_drawing.color_regs_ecs[pv]; break;
					case 0x10: ham_lastcolor &= 0xFF0; ham_lastcolor |= (pv & 0xF); break;
					case 0x20: ham_lastcolor &= 0x0FF; ham_lastcolor |= (pv & 0xF) << 8; break;
					case 0x30: ham_lastcolor &= 0xF0F; ham_lastcolor |= (pv & 0xF) << 4; break;
				}
				ham_linebuf[ham_decode_pixel++] = ham_lastcolor;
			}
		}
	}	
		
	function weird_bitplane_fix() {
		for (var i = playfield_start >> lores_shift; i < playfield_end >> lores_shift; i++) {
			if (apixels[pixels_offset + i] > 16) apixels[pixels_offset + i] = 16;
		}
	}

	//line_data -> apixels
	this.pfield_doline_1 = function (lineno, wordcount, planes) {
		var pixels = MAX_PIXELS_PER_LINE;
		var tmp, d0, d1, d2, d3, d4, d5, d6, d7;
		var offs = 0;

		while (wordcount-- > 0) {
			d0 = d1 = d2 = d3 = d4 = d5 = d6 = d7 = 0;

			switch (planes) {
				/*#ifdef AGA
				 case 8: d0 = line_data[lineno][7][offs];
				 case 7: d1 = line_data[lineno][6][offs];
				 #endif*/
				case 6:
					d2 = line_data[lineno][5][offs];
				case 5:
					d3 = line_data[lineno][4][offs];
				case 4:
					d4 = line_data[lineno][3][offs];
				case 3:
					d5 = line_data[lineno][2][offs];
				case 2:
					d6 = line_data[lineno][1][offs];
				case 1:
					d7 = line_data[lineno][0][offs];
			}
			offs++;

			tmp = (d0 ^ (d1 >>> 1)) & 0x55555555;
			d0 ^= tmp;
			d1 ^= (tmp << 1);
			tmp = (d2 ^ (d3 >>> 1)) & 0x55555555;
			d2 ^= tmp;
			d3 ^= (tmp << 1);
			tmp = (d4 ^ (d5 >>> 1)) & 0x55555555;
			d4 ^= tmp;
			d5 ^= (tmp << 1);
			tmp = (d6 ^ (d7 >>> 1)) & 0x55555555;
			d6 ^= tmp;
			d7 ^= (tmp << 1);

			tmp = (d0 ^ (d2 >>> 2)) & 0x33333333;
			d0 ^= tmp;
			d2 ^= (tmp << 2);
			tmp = (d1 ^ (d3 >>> 2)) & 0x33333333;
			d1 ^= tmp;
			d3 ^= (tmp << 2);
			tmp = (d4 ^ (d6 >>> 2)) & 0x33333333;
			d4 ^= tmp;
			d6 ^= (tmp << 2);
			tmp = (d5 ^ (d7 >>> 2)) & 0x33333333;
			d5 ^= tmp;
			d7 ^= (tmp << 2);

			tmp = (d0 ^ (d4 >>> 4)) & 0x0f0f0f0f;
			d0 ^= tmp;
			d4 ^= (tmp << 4);
			tmp = (d1 ^ (d5 >>> 4)) & 0x0f0f0f0f;
			d1 ^= tmp;
			d5 ^= (tmp << 4);
			tmp = (d2 ^ (d6 >>> 4)) & 0x0f0f0f0f;
			d2 ^= tmp;
			d6 ^= (tmp << 4);
			tmp = (d3 ^ (d7 >>> 4)) & 0x0f0f0f0f;
			d3 ^= tmp;
			d7 ^= (tmp << 4);

			tmp = (d0 ^ (d1 >>> 8)) & 0x00ff00ff;
			d0 ^= tmp;
			d1 ^= (tmp << 8);
			tmp = (d2 ^ (d3 >>> 8)) & 0x00ff00ff;
			d2 ^= tmp;
			d3 ^= (tmp << 8);
			tmp = (d4 ^ (d5 >>> 8)) & 0x00ff00ff;
			d4 ^= tmp;
			d5 ^= (tmp << 8);
			tmp = (d6 ^ (d7 >>> 8)) & 0x00ff00ff;
			d6 ^= tmp;
			d7 ^= (tmp << 8);

			tmp = (d0 ^ (d2 >>> 16)) & 0x0000ffff;
			d0 ^= tmp;
			d2 ^= (tmp << 16);
			tmp = (d1 ^ (d3 >>> 16)) & 0x0000ffff;
			d1 ^= tmp;
			d3 ^= (tmp << 16);
			tmp = (d4 ^ (d6 >>> 16)) & 0x0000ffff;
			d4 ^= tmp;
			d6 ^= (tmp << 16);
			tmp = (d5 ^ (d7 >>> 16)) & 0x0000ffff;
			d5 ^= tmp;
			d7 ^= (tmp << 16);

			apixels[pixels     ] = (d0 >>> 24) & 0xff;
			apixels[pixels + 1] = (d0 >>> 16) & 0xff;
			apixels[pixels + 2] = (d0 >>> 8) & 0xff;
			apixels[pixels + 3] = d0 & 0xff;
			apixels[pixels + 4] = (d4 >>> 24) & 0xff;
			apixels[pixels + 5] = (d4 >>> 16) & 0xff;
			apixels[pixels + 6] = (d4 >>> 8) & 0xff;
			apixels[pixels + 7] = d4 & 0xff;
			apixels[pixels + 8] = (d1 >>> 24) & 0xff;
			apixels[pixels + 9] = (d1 >>> 16) & 0xff;
			apixels[pixels + 10] = (d1 >>> 8) & 0xff;
			apixels[pixels + 11] = d1 & 0xff;
			apixels[pixels + 12] = (d5 >>> 24) & 0xff;
			apixels[pixels + 13] = (d5 >>> 16) & 0xff;
			apixels[pixels + 14] = (d5 >>> 8) & 0xff;
			apixels[pixels + 15] = d5 & 0xff;
			apixels[pixels + 16] = (d2 >>> 24) & 0xff;
			apixels[pixels + 17] = (d2 >>> 16) & 0xff;
			apixels[pixels + 18] = (d2 >>> 8) & 0xff;
			apixels[pixels + 19] = d2 & 0xff;
			apixels[pixels + 20] = (d6 >>> 24) & 0xff;
			apixels[pixels + 21] = (d6 >>> 16) & 0xff;
			apixels[pixels + 22] = (d6 >>> 8) & 0xff;
			apixels[pixels + 23] = d6 & 0xff;
			apixels[pixels + 24] = (d3 >>> 24) & 0xff;
			apixels[pixels + 25] = (d3 >>> 16) & 0xff;
			apixels[pixels + 26] = (d3 >>> 8) & 0xff;
			apixels[pixels + 27] = d3 & 0xff;
			apixels[pixels + 28] = (d7 >>> 24) & 0xff;
			apixels[pixels + 29] = (d7 >>> 16) & 0xff;
			apixels[pixels + 30] = (d7 >>> 8) & 0xff;
			apixels[pixels + 31] = d7 & 0xff;
			pixels += 32;

			/*apixels[pixels++] = (d0 >>> 24);			
			 apixels[pixels++] = (d0 >>> 16) & 0xff;			
			 apixels[pixels++] = (d0 >>> 8) & 0xff;			
			 apixels[pixels++] =  d0 & 0xff;	
			 apixels[pixels++] = (d4 >>> 24);			
			 apixels[pixels++] = (d4 >>> 16) & 0xff;			
			 apixels[pixels++] = (d4 >>> 8) & 0xff;			
			 apixels[pixels++] =  d4 & 0xff;								
			 apixels[pixels++] = (d1 >>> 24);			
			 apixels[pixels++] = (d1 >>> 16) & 0xff;			
			 apixels[pixels++] = (d1 >>> 8) & 0xff;			
			 apixels[pixels++] =  d1 & 0xff;							
			 apixels[pixels++] = (d5 >>> 24);			
			 apixels[pixels++] = (d5 >>> 16) & 0xff;			
			 apixels[pixels++] = (d5 >>> 8) & 0xff;			
			 apixels[pixels++] =  d5 & 0xff;																		
			 apixels[pixels++] = (d2 >>> 24);			
			 apixels[pixels++] = (d2 >>> 16) & 0xff;			
			 apixels[pixels++] = (d2 >>> 8) & 0xff;			
			 apixels[pixels++] =  d2 & 0xff;			
			 apixels[pixels++] = (d6 >>> 24);			
			 apixels[pixels++] = (d6 >>> 16) & 0xff;			
			 apixels[pixels++] = (d6 >>> 8) & 0xff;			
			 apixels[pixels++] =  d6 & 0xff;								
			 apixels[pixels++] = (d3 >>> 24);			
			 apixels[pixels++] = (d3 >>> 16) & 0xff;			
			 apixels[pixels++] = (d3 >>> 8) & 0xff;			
			 apixels[pixels++] =  d3 & 0xff;						
			 apixels[pixels++] = (d7 >>> 24);			
			 apixels[pixels++] = (d7 >>> 16) & 0xff;			
			 apixels[pixels++] = (d7 >>> 8) & 0xff;			
			 apixels[pixels++] =  d7 & 0xff;*/
		}
	};
	
	this.pfield_doline = function (lineno) {
		if (bplplanecnt)
			this.pfield_doline_1(lineno, dp_for_drawing.plflinelen, bplplanecnt);
		else {
			for (var i = 0; i < dp_for_drawing.plflinelen * 32; i++) apixels[i] = 0; //memset (data, 0, dp_for_drawing.plflinelen * 32);   			
		}
	};
				
	this.pfield_draw_line = function (vb, lineno, gfx_ypos, follow_ypos) {
		if (!AMIGA.config.video.enabled) return;
		//console.log('pfield_draw_line', lineno, gfx_ypos, follow_ypos);		
		var border = 0;
		var do_double = 0;

		dp_for_drawing = line_decisions[lineno];
		dip_for_drawing = curr_drawinfo[lineno];

		switch (linestate[lineno]) {
			case LINE_REMEMBERED_AS_PREVIOUS:
				BUG.info('pfield_draw_line() Shouldn\'t get here... this is a bug.');
				return;
			case LINE_BLACK:
				linestate[lineno] = LINE_REMEMBERED_AS_BLACK;
				border = 2;
				break;
			case LINE_REMEMBERED_AS_BLACK:
				return;
			case LINE_AS_PREVIOUS:
				//dp_for_drawing--;
				//dip_for_drawing--;
				dp_for_drawing = line_decisions[lineno - 1];
				dip_for_drawing = curr_drawinfo[lineno - 1];
				linestate[lineno] = LINE_DONE_AS_PREVIOUS;
				if (dp_for_drawing.plfleft < 0)
					border = 1;
				break;
			case LINE_DONE_AS_PREVIOUS:
			/* fall through */
			case LINE_DONE:
				return;
			case LINE_DECIDED_DOUBLE:
				if (follow_ypos >= 0) {
					do_double = 1;
					linestate[lineno + 1] = LINE_DONE_AS_PREVIOUS;
				}
			/* fall through */
			default:
				if (dp_for_drawing.plfleft < 0)
					border = 1;
				linestate[lineno] = LINE_DONE;
				break;
		}

		if (border == 0) {
			this.pfield_expand_dp_bplcon();
			this.pfield_init_linetoscr();
			this.pfield_doline(lineno);

			this.adjust_drawing_colors(dp_for_drawing.ctable, dp_for_drawing.ham_seen || bplehb || ecsshres);

			if (dp_for_drawing.ham_seen) {
				init_ham_decoding();
				if (dip_for_drawing.nr_color_changes == 0)
					decode_ham(visible_left_border, visible_right_border, false);
				else {
					this.do_color_changes(dummy_worker, decode_ham, lineno);
					this.adjust_drawing_colors(dp_for_drawing.ctable, dp_for_drawing.ham_seen || bplehb);
				}
				bplham = dp_for_drawing.ham_at_start;
			}
			if (plf2pri > 5 && bplplanecnt == 5 && !(AMIGA.config.chipset.mask & CSMASK_AGA))
				weird_bitplane_fix();

			if (dip_for_drawing.nr_sprites) {
				/*#ifdef AGA
				 if (brdsprt)
				 this.clear_bitplane_border_aga();
				 #endif*/
				for (var i = 0; i < dip_for_drawing.nr_sprites; i++)
					draw_sprites(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i]);
			}
			this.do_color_changes(pfield_do_fill_line, pfield_do_linetoscr, lineno);

			this.do_flush_line(vb, gfx_ypos);
			if (do_double)
				this.do_flush_line(vb, follow_ypos);
		} else if (border == 1) {
			var dosprites = 0;

			this.adjust_drawing_colors(dp_for_drawing.ctable, false);

			/*#ifdef AGA
			 if (brdsprt && dip_for_drawing->nr_sprites > 0) {
			 dosprites = 1;
			 this.pfield_expand_dp_bplcon();
			 pfield_init_linetoscr ();
			 memset (apixels + MAX_PIXELS_PER_LINE, colors_for_drawing.borderblank ? 0 : colors_for_drawing.acolors[0], MAX_PIXELS_PER_LINE);
			 }
			 #endif*/
			if (!dosprites && dip_for_drawing.nr_color_changes == 0) {
				fill_line();
				this.do_flush_line(vb, gfx_ypos);
				if (do_double)
					this.do_flush_line(vb, follow_ypos);
				return;
			}
			if (dosprites) {
				for (var i = 0; i < dip_for_drawing.nr_sprites; i++)
					this.draw_sprites(curr_sprite_entries[dip_for_drawing.first_sprite_entry + i]);
				for (var i = 0; i < apixels.length; i++) apixels[i] = 0; //memset (apixels, 0, sizeof apixels);
				//var oxor = bplxor;
				//bplxor = 0;
				this.do_color_changes(pfield_do_fill_line, pfield_do_linetoscr, lineno);
				//bplxor = oxor;
			} else {
				playfield_start = visible_right_border;
				playfield_end = visible_right_border;
				this.do_color_changes(pfield_do_fill_line, pfield_do_fill_line, lineno);
			}
			this.do_flush_line(vb, gfx_ypos);
			if (do_double)
				this.do_flush_line(vb, follow_ypos);
		} else {
			//var tmp = hposblank;
			//hposblank = brdblank;
			//hposblank = colors_for_drawing.borderblank;
			fill_line();
			this.do_flush_line(vb, gfx_ypos);
			//hposblank = tmp;
		}
	};
		
	this.init_drawing_frame = function () {
		this.init_hardware_for_drawing_frame();

		/*if (thisframe_first_drawn_line < 0)
			thisframe_first_drawn_line = minfirstline;
		if (thisframe_first_drawn_line > thisframe_last_drawn_line)
			thisframe_last_drawn_line = thisframe_first_drawn_line;*/

		var maxline = ((this.maxvpos_nom + 1) << linedbl) + 2;

		if (SMART_UPDATE) {
			for (var i = 0; i < maxline; i++) {
				switch (linestate[i]) {
					case LINE_DONE_AS_PREVIOUS:
						linestate[i] = LINE_REMEMBERED_AS_PREVIOUS;
						break;
					case LINE_REMEMBERED_AS_BLACK:
						break;
					default:
						linestate[i] = LINE_UNDECIDED;
						break;
				}
			}
		} else {
			for (var i = 0; i < maxline; i++) linestate[i] = LINE_UNDECIDED; //memset(linestate, LINE_UNDECIDED, maxline);
		}

		last_drawn_line = 0;
		first_drawn_line = 0x7fff;

		first_block_line = last_block_line = NO_BLOCK;
		if (frame_redraw_necessary)
			frame_redraw_necessary--;

		this.center_image();

		thisframe_first_drawn_line = -1;
		thisframe_last_drawn_line = -1;

		drawing_color_matches = -1;
	};
	
	this.finish_drawing_frame = function () {
		var vb = gfxvidinfo.drawbuffer;

		if (SMART_UPDATE) {
			for (var i = 0; i < max_ypos_thisframe; i++) {
				var i1 = i + min_ypos_for_screen;
				var line = i + thisframe_y_adjust_real;

				var where2 = amiga2aspect_line_map[i1];
				if (where2 >= vb.inheight)
					break;
				if (where2 < 0)
					continue;
				hposblank = 0;
				this.pfield_draw_line(vb, line, where2, amiga2aspect_line_map[i1 + 1]);
			}
			//if (lightpen_active) lightpen_update(vb);

			//this.do_flush_screen(vb, first_drawn_line, last_drawn_line);	
		}
		/*else {
		 if (!interlace_seen)
		 this.do_flush_screen(vb, first_drawn_line, last_drawn_line);		
		 }*/
	};
	
	this.hardware_line_completed = function (lineno) {
		if (!SMART_UPDATE) {
			var i = lineno - thisframe_y_adjust_real;
			if (i >= 0 && i < max_ypos_thisframe) {
				var where = amiga2aspect_line_map[i + min_ypos_for_screen];
				if (where < gfxvidinfo.drawbuffer.outheight && where >= 0)
					this.pfield_draw_line(null, lineno, where, amiga2aspect_line_map[i + min_ypos_for_screen + 1]);
			}
		}
	};

	this.notice_interlace_seen = function (lace) {
		var changed = false;
		if (lace) {
			if (interlace_seen == 0) {
				changed = true;
				//BUG.info('->lace');
			}
			interlace_seen = AMIGA.config.video.vresolution ? 1 : -1;
		} else {
			if (interlace_seen) {
				changed = true;
				//BUG.info('->non-lace');
			}
			interlace_seen = 0;
		}
		return changed;
	};
	
	this.notice_screen_contents_lost = function () {
		frame_redraw_necessary = 2;
	};
	
	/*---------------------------------*/

	this.reset_lores = function () {
		lores_shift = AMIGA.config.video.hresolution;
		if (doublescan > 0) {
			if (lores_shift < 2)
				lores_shift++;
		}
		sprite_buffer_res = AMIGA.config.video.hresolution;
		if (doublescan > 0 && sprite_buffer_res < RES_SUPERHIRES)
			sprite_buffer_res++;
	};	

	this.bpldmainitdelay = function (hpos) {
		var hposa = hpos + (4 + (bplcon0_planes == 8 ? 1 : 0)); //BPLCON_AGNUS_DELAY;
		ddf_change = this.vpos;
		if (hposa < 0x14) {
			this.BPLCON0_Denise(hpos, bplcon0, false);
			this.setup_fmodes(hpos);
			return;
		}
		if (bpldmasetuphpos < 0) {
			bpldmasetupphase = 0;
			bpldmasetuphpos = hpos + BPLCON_DENISE_DELAY;
		}
	};
		
	this.update_ddf_change = function () {
		ddf_change = this.vpos;
	};	

	/*---------------------------------*/
		
	this.allocsoftbuffer = function (buf, flags, width, height, depth) {
		buf.rowbytes = MAX_PIXELS_PER_LINE >> 3;
		/* for xlinecheck() */
		buf.pixbytes = Math.floor((depth + 7) / 8);
		buf.width_allocated = (width + 7) & ~7;
		buf.height_allocated = height;
	};	
	
	this.setup_drawing = function () {
		setup_drawing_tables();
		this.allocsoftbuffer(gfxvidinfo.drawbuffer, 0, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_DEPTH);
	};

	this.cleanup_drawing = function () {
	};

	this.reset_drawing = function () {
		var i;
		max_diwstop = 0;
		this.reset_lores();
		for (i = 0; i < linestate.length; i++) linestate[i] = LINE_UNDECIDED;
		this.recreate_aspect_maps();
		last_redraw_point = 0;
		for (i = 0; i < spixels.length; i++) spixels[i] = 0; //memset(spixels, 0, sizeof spixels);       
		for (i = 0; i < spixstate.length; i++) spixstate[i] = 0; //memset(&spixstate, 0, sizeof spixstate);  	
		this.init_drawing_frame();
		this.notice_screen_contents_lost();
		//lightpen_y1 = lightpen_y2 = -1;
		center_reset = true;
	};	
	
	/*-----------------------------------------------------------------------*/
	/* sprites */
	/*-----------------------------------------------------------------------*/
	
	function setup_sprite_tables() {
		for (var i = 0; i < 256; i++) {
			sprtaba[i] =
				  (((i >> 7) & 1) << 0)
				| (((i >> 6) & 1) << 2)
				| (((i >> 5) & 1) << 4)
				| (((i >> 4) & 1) << 6)
				| (((i >> 3) & 1) << 8)
				| (((i >> 2) & 1) << 10)
				| (((i >> 1) & 1) << 12)
				| (((i >> 0) & 1) << 14);
			sprtabb[i] = sprtaba[i] << 1;
			sprite_ab_merge[i] = ((i & 15) ? 1 : 0) | ((i & 240) ? 2 : 0);
			clxtab[i] =
				((((i & 3) && (i & 12)) << 9) | 
				(((i & 3) && (i & 48)) << 10) | 
				(((i & 3) && (i & 192)) << 11) | 
				(((i & 12) && (i & 48)) << 12) | 
				(((i & 12) && (i & 192)) << 13) | 
				(((i & 48) && (i & 192)) << 14));
			sprite_offs[i] = (i & 15) ? 0 : 2;
		}
		for (var i = 0; i < 16; i++) {
			clxmask[i] = 
				  ((i & 1) ? 0xF : 0x3)
				| ((i & 2) ? 0xF0 : 0x30)
				| ((i & 4) ? 0xF00 : 0x300)
				| ((i & 8) ? 0xF000 : 0x3000);
			sprclx[i] = 
				 (((i & 0x3) == 0x3 ? 1 : 0)
				| ((i & 0x5) == 0x5 ? 2 : 0)
				| ((i & 0x9) == 0x9 ? 4 : 0)
				| ((i & 0x6) == 0x6 ? 8 : 0)
				| ((i & 0xA) == 0xA ? 16 : 0)
				| ((i & 0xC) == 0xC ? 32 : 0)) << 9;
		}
	}		
		
	function render_sprites(pos, dualpf, apixel, aga) {
		if (!DO_SPRITES) return 0; //FIXME
		var spb = spritepixels[pos];
		var v = spb.data;
		var shift_lookup = dualpf ? (bpldualpfpri ? dblpf_ms2 : dblpf_ms1) : dblpf_ms;
		var maskshift = shift_lookup[apixel];
		var plfmask = (plf_sprite_mask >>> maskshift) >>> maskshift;
		
		v &= ~plfmask;
		if (v != 0) { //|| SPRITE_DEBUG) {
			var vlo, vhi, col;
			var v1 = v & 255;
			var offs;
			if (v1 == 0)
				offs = 4 + sprite_offs[v >> 8];
			else
				offs = sprite_offs[v1];

			v >>= offs * 2;
			v &= 15;
/*#if SPRITE_DEBUG > 0
			v ^= 8;
#endif*/
			if (spb.attach && (spb.stdata & (3 << offs))) {
				col = v;
				if (aga)
					col += sbasecol[1];
				else
					col += 16;
			} else {
				vlo = v & 3;
				vhi = (v & (vlo - 1)) >> 2;
				col = (vlo | vhi);
				if (aga) {
					if (vhi > 0)
						col += sbasecol[1];
					else
						col += sbasecol[0];
				} else {
					col += 16;
				}
				col += offs * 2;
			}
			return col;
		}
		return 0;
	}	
		
	function draw_sprites_1(e, dualpf, has_attach) {
		//uae_u16 *buf = spixels + e.first_pixel;
		//uae_u8 *stbuf = spixstate.bytes + e.first_pixel;
		//buf -= e.pos;
		//stbuf -= e.pos;
		var pos2 = e.first_pixel - e.pos;

		var spr_pos = e.pos + ((DIW_DDF_OFFSET - DISPLAY_LEFT_SHIFT) << sprite_buffer_res);

		if (spr_pos < sprite_first_x)
			sprite_first_x = spr_pos;

		for (var pos = e.pos; pos < e.max; pos++, spr_pos++) {
			if (spr_pos >= 0 && spr_pos < MAX_PIXELS_PER_LINE) {
				//spritepixels[spr_pos].data = buf[pos];
				//spritepixels[spr_pos].stdata = stbuf[pos];
				spritepixels[spr_pos].data = spixels[pos2 + pos];
				spritepixels[spr_pos].stdata = spixstate[pos2 + pos];
				spritepixels[spr_pos].attach = has_attach;
			}
		}
		if (spr_pos > sprite_last_x)
			sprite_last_x = spr_pos;
	}

	function draw_sprites(e) {   
		if (!DO_SPRITES) return; //FIXME
		draw_sprites_1(e, bpldualpf, e.has_attached);
	}		
	
	function ecsshres_func() {
		return bplcon0_res == RES_SUPERHIRES && (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && !(AMIGA.config.chipset.mask & CSMASK_AGA);
	}

	/* handle very rarely needed playfield collision (CLXDAT bit 0) only known game needing this is Rotor */
	this.do_playfield_collisions = function () {
		var ddf_left = thisline_decision.plfleft * 2 << bplcon0_res;
		var hw_diwlast = coord_window_to_diw_x(thisline_decision.diwlastword);
		var hw_diwfirst = coord_window_to_diw_x(thisline_decision.diwfirstword);
		var i, collided, minpos, maxpos;
		/*#ifdef AGA
		 var planes = (currprefs.chipset_mask & CSMASK_AGA) ? 8 : 6;
		 #else*/
		var planes = 6;
//#endif

		if (clxcon_bpl_enable == 0) {
			clxdat |= 1;
			return;
		}
		if (clxdat & 1)
			return;

		collided = 0;
		minpos = thisline_decision.plfleft * 2;
		if (minpos < hw_diwfirst)
			minpos = hw_diwfirst;
		maxpos = thisline_decision.plfright * 2;
		if (maxpos > hw_diwlast)
			maxpos = hw_diwlast;
		for (i = minpos; i < maxpos && !collided; i += 32) {
			var offs = ((i << bplcon0_res) - ddf_left) >> 3;
			var j;
			var total = 0xffffffff;
			for (j = 0; j < planes; j++) {
				var ena = (clxcon_bpl_enable >> j) & 1;
				var match = (clxcon_bpl_match >> j) & 1;
				var t = 0xffffffff;
				if (ena) {
					if (j < thisline_decision.nr_planes) {
						//t = *(uae_u32 *)(line_data[next_lineno] + offs + 2 * j * MAX_WORDS_PER_LINE);
						t = line_data[next_lineno][j][offs];
						t ^= (match & 1) - 1;
					} else {
						t = (match & 1) - 1;
					}
				}
				total &= t;
			}
			if (total) {
				collided = 1;
				/*if (1) { //debug
				 for (var k = 0; k < 1; k++) {
				 //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + offs + 2 * k * MAX_WORDS_PER_LINE); *ldata ^= 0x5555555555;
				 line_data[next_lineno][k][offs] ^= 0x5555555555;
				 }
				 }*/
			}
		}
		if (collided)
			clxdat |= 1;
	};
	
	/* Sprite-to-sprite collisions are taken care of in record_sprite.  This one does playfield/sprite collisions. */	
	this.do_sprite_collisions = function () {
		var nr_sprites = curr_drawinfo[next_lineno].nr_sprites;
		var first = curr_drawinfo[next_lineno].first_sprite_entry;
		var collision_mask = clxmask[clxcon >> 12];
		var ddf_left = thisline_decision.plfleft * 2 << bplcon0_res;
		var hw_diwlast = coord_window_to_diw_x(thisline_decision.diwlastword);
		var hw_diwfirst = coord_window_to_diw_x(thisline_decision.diwfirstword);

		if (clxcon_bpl_enable == 0) {
			clxdat |= 0x1fe;
			return;
		}

		for (var i = 0; i < nr_sprites; i++) {
			var e = curr_sprite_entries[first + i];
			var minpos = e.pos;
			var maxpos = e.max;
			var minp1 = minpos >> sprite_buffer_res;
			var maxp1 = maxpos >> sprite_buffer_res;

			if (maxp1 > hw_diwlast)
				maxpos = hw_diwlast << sprite_buffer_res;
			if (maxp1 > thisline_decision.plfright * 2)
				maxpos = thisline_decision.plfright * 2 << sprite_buffer_res;
			if (minp1 < hw_diwfirst)
				minpos = hw_diwfirst << sprite_buffer_res;
			if (minp1 < thisline_decision.plfleft * 2)
				minpos = thisline_decision.plfleft * 2 << sprite_buffer_res;

			for (var j = minpos; j < maxpos; j++) {
				var sprpix = spixels[e.first_pixel + j - e.pos] & collision_mask;

				if (sprpix == 0)
					continue;

				var match = 1;
				var offs = ((j << bplcon0_res) >> sprite_buffer_res) - ddf_left;
				sprpix = (sprite_ab_merge[sprpix & 255] | (sprite_ab_merge[sprpix >> 8] << 2)) << 1;

				for (var k = 1; k >= 0; k--) {
					/*#ifdef AGA
					 var planes = (currprefs.chipset_mask & CSMASK_AGA) ? 8 : 6;
					 #else*/
					var planes = 6;
//#endif
					if (bplcon0 & 0x400)
						match = 1;
					for (var l = k; match && l < planes; l += 2) {
						var t = 0;
						if (l < thisline_decision.nr_planes) {
							//uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * l * MAX_WORDS_PER_LINE); var word = ldata[offs >> 5];
							var word = line_data[next_lineno][l][offs >> 5];
							t = (word >>> (31 - (offs & 31))) & 1;
							/*if (1) { //debug: draw collision mask
							 for (var m = 0; m < 5; m++) {
							 //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * m * MAX_WORDS_PER_LINE); ldata[(offs >> 5) + 1] |= 15 << (31 - (offs & 31));
							 line_data[next_lineno][m][(offs >> 5) + 0] |= 15 << (31 - (offs & 31));							
							 }
							 }*/
						}
						if (clxcon_bpl_enable & (1 << l)) {
							if (t != ((clxcon_bpl_match >> l) & 1))
								match = 0;
						}
					}
					if (match) {
						/*if (1) { //debug: mark lines where collisions are detected
						 for (var l = 0; l < 5; l++) {
						 //uae_u32 *ldata = (uae_u32 *)(line_data[next_lineno] + 2 * l * MAX_WORDS_PER_LINE); ldata[(offs >> 5) + 1] |= 15 << (31 - (offs & 31));
						 line_data[next_lineno][l][(offs >> 5) + 0] |= 15 << (31 - (offs & 31));							
						 }
						 }*/
						clxdat |= (sprpix << (k * 4));
					}
				}
			}
		}
		/*{
		 static var olx;
		 if (clxdat != olx) BUG.info('%d: %04x', vpos, clxdat);
		 olx = clxdat;
		 }*/
	};
	
	this.record_sprite_1 = function (sprxp, buf, datab, num, dbl, mask, do_collisions, collision_mask) {
		var j = 0;

		while (datab) {
			var col = 0;
			var coltmp = 0;

			if ((sprxp >= sprite_minx && sprxp < sprite_maxx) || (bplcon3 & 2))
				col = (datab & 3) << (2 * num);

			//if (sprxp == sprite_minx || sprxp == sprite_maxx - 1) col ^= Math.floor(Math.random() * 0xffffffff);

			if ((j & mask) == 0) {
				//var tmp = (*buf) | col; *buf++ = tmp;
				var tmp = spixels[buf] | col;
				spixels[buf++] = tmp;
				if (do_collisions)
					coltmp |= tmp;
				sprxp++;
			}
			if (dbl > 0) {
				//var tmp = (*buf) | col; *buf++ = tmp;
				var tmp = spixels[buf] | col;
				spixels[buf++] = tmp;
				if (do_collisions)
					coltmp |= tmp;
				sprxp++;
			}
			if (dbl > 1) {
				var tmp;
				//tmp = (*buf) | col; *buf++ = tmp;
				tmp = spixels[buf] | col;
				spixels[buf++] = tmp;
				if (do_collisions)
					coltmp |= tmp;
				//tmp = (*buf) | col; *buf++ = tmp;
				tmp = spixels[buf] | col;
				spixels[buf++] = tmp;
				if (do_collisions)
					coltmp |= tmp;
				sprxp++;
				sprxp++;
			}
			j++;
			datab >>>= 2;
			if (do_collisions) {
				coltmp &= collision_mask;
				if (coltmp) {
					var shrunk_tmp = sprite_ab_merge[coltmp & 255] | (sprite_ab_merge[coltmp >> 8] << 2);
					clxdat |= sprclx[shrunk_tmp];
				}
			}
		}
	};
	
	//this.record_sprite = function(line, num, sprxp, data, datb, ctl) {
	this.record_sprite = function (line, num, sprxp) {
		var e = curr_sprite_entries[next_sprite_entry];
		var word_offs;
		var collision_mask;
		var width, dbl, half;
		var mask = 0;
		var attachment;
		var i;

		//var data = 0, datb = 0;
		var this_sprite_entry = next_sprite_entry;
		var num2 = 0;

		half = 0;
		dbl = sprite_buffer_res - sprres;
		if (dbl < 0) {
			half = -dbl;
			dbl = 0;
			mask = 1 << half;
		}
		width = (sprite_width << sprite_buffer_res) >> sprres;
		attachment = sprctl[num | 1] & 0x80;

		/* Try to coalesce entries if they aren't too far apart  */
		//if (!next_sprite_forced && e[-1].max + sprite_width >= sprxp) {
		if (this_sprite_entry > 0 && !next_sprite_forced && curr_sprite_entries[this_sprite_entry - 1].max + sprite_width >= sprxp) {
			//e--;
			e = curr_sprite_entries[this_sprite_entry - 1];
			this_sprite_entry--;
			//console.log('RS',this_sprite_entry);
		} else {
			next_sprite_entry++;
			e.pos = sprxp;
			e.has_attached = 0;
		}

		if (sprxp < e.pos)
			Fatal(333, 'sprxp < e->pos');

		e.max = sprxp + width;
		//e[1].first_pixel = e.first_pixel + ((e.max - e.pos + 3) & ~3);
		curr_sprite_entries[this_sprite_entry + 1].first_pixel = e.first_pixel + ((e.max - e.pos + 3) & ~3);
		next_sprite_forced = 0;

		collision_mask = clxmask[clxcon >> 12];
		word_offs = e.first_pixel + sprxp - e.pos;

		for (i = 0; i < sprite_width; i += 16) {
			//var da = *data;
			//var db = *datb;
			//var da = sprdata[data][0];
			//var db = sprdatb[datb][0];
			var da = sprdata[num][num2];
			var db = sprdatb[num][num2];
			var datab = ((sprtaba[da & 0xFF] << 16) | sprtaba[da >> 8] | (sprtabb[db & 0xFF] << 16) | sprtabb[db >> 8]) >>> 0;
			var off = (i << dbl) >> half;
			//uae_u16 *buf = spixels + word_offs + off;
			var buf = word_offs + off;
			if (AMIGA.config.chipset.collision_level > 0 && collision_mask)
				this.record_sprite_1(sprxp + off, buf, datab, num, dbl, mask, 1, collision_mask);
			else
				this.record_sprite_1(sprxp + off, buf, datab, num, dbl, mask, 0, collision_mask);

			//*data++; *datb++;
			num2++;
		}

		/* We have 8 bits per pixel in spixstate, two for every sprite pair. 
		 The low order bit records whether the attach bit was set for this pair.  */
		if (attachment && !ecsshres_func()) {
			var state = ((0x01010101 << (num & ~1)) >>> 0) & 0xff;
			/*uae_u8 *stb1 = spixstate.bytes + word_offs;
			 for (i = 0; i < width; i += 8) {
			 stb1[0] |= state;
			 stb1[1] |= state;
			 stb1[2] |= state;
			 stb1[3] |= state;
			 stb1[4] |= state;
			 stb1[5] |= state;
			 stb1[6] |= state;
			 stb1[7] |= state;
			 stb1 += 8;
			 }*/
			var stb1 = word_offs;
			for (i = 0; i < width; i += 8) {
				spixstate[stb1 + 0] |= state;
				spixstate[stb1 + 1] |= state;
				spixstate[stb1 + 2] |= state;
				spixstate[stb1 + 3] |= state;
				spixstate[stb1 + 4] |= state;
				spixstate[stb1 + 5] |= state;
				spixstate[stb1 + 6] |= state;
				spixstate[stb1 + 7] |= state;
				stb1 += 8;
			}
			e.has_attached = 1;
		}
	};

	function tospritexdiw(diw) {
		return coord_window_to_hw_x(diw - (DIW_DDF_OFFSET << lores_shift)) << sprite_buffer_res;
	}
	function tospritexddf(ddf) {
		return (ddf << 1) << sprite_buffer_res;
	}
	/*function fromspritexdiw(ddf) {
		return coord_hw_to_window_x(ddf >> sprite_buffer_res) + (DIW_DDF_OFFSET << lores_shift);
	}*/

	function calcsprite() {
		sprite_maxx = 0x7fff;
		sprite_minx = 0;
		if (thisline_decision.diwlastword >= 0)
			sprite_maxx = tospritexdiw(thisline_decision.diwlastword);
		if (thisline_decision.diwfirstword >= 0)
			sprite_minx = tospritexdiw(thisline_decision.diwfirstword);
		if (thisline_decision.plfleft >= 0) {
			var min = tospritexddf(thisline_decision.plfleft);
			var max = tospritexddf(thisline_decision.plfright);
			if (min > sprite_minx && min < max) /* min < max = full line ddf */
				sprite_minx = min;
		}
	}

	function add_sprite(count, num, sprxp, posns, nrs) {
		var bestp, j;
		for (bestp = 0; bestp < count; bestp++) {
			if (posns[bestp] > sprxp)
				break;
			if (posns[bestp] == sprxp && nrs[bestp] < num)
				break;
		}
		for (j = count; j > bestp; j--) {
			posns[j] = posns[j - 1];
			nrs[j] = nrs[j - 1];
		}
		posns[j] = sprxp;
		nrs[j] = num;
	}
	
	this.decide_sprites = function (hpos) {
		if (!DO_SPRITES) return; //FIXME
		var nrs = [], posns = [];
		var point = hpos * 2 - 3;
		//var width = sprite_width;
		var sscanmask = 0x100 << sprite_buffer_res;
		//var gotdata = 0;
		var count, i;

		if (thisline_decision.plfleft < 0 && !(bplcon3 & 2))
			return;

		if (this.nodraw() || hpos < 0x14 || nr_armed == 0 || point == last_sprite_point)
			return;

		this.decide_diw(hpos);
		this.decide_line(hpos);

		calcsprite();

		for (i = 0; i < MAX_SPRITES * 2; i++)
			nrs[i] = posns[i] = 0;

		count = 0;
		for (i = 0; i < MAX_SPRITES; i++) {
			var sprxp = (fmode & 0x8000) ? (spr[i].xpos & ~sscanmask) : spr[i].xpos;
			var hw_xp = sprxp >> sprite_buffer_res;

			if (!spr[i].armed || spr[i].xpos < 0)
				continue;
			/*if (!((debug_sprite_mask & magic_sprite_mask) & (1 << i)))
			 continue;*/

			if (hw_xp > last_sprite_point && hw_xp <= point)
				add_sprite(count++, i, sprxp, posns, nrs);

			if ((fmode & 0x8000) && !(sprxp & sscanmask)) {
				sprxp |= sscanmask;
				hw_xp = sprxp >> sprite_buffer_res;
				if (hw_xp > last_sprite_point && hw_xp <= point)
					add_sprite(count++, MAX_SPRITES + i, sprxp, posns, nrs);
			}
		}
		for (i = 0; i < count; i++) {
			var nr = nrs[i] & (MAX_SPRITES - 1);
			//this.record_sprite(next_lineno, nr, posns[i], sprdata[nr], sprdatb[nr], sprctl[nr]);
			this.record_sprite(next_lineno, nr, posns[i]);

			/* get left and right sprite edge if brdsprt enabled */
			/*#if AUTOSCALE_SPRITES
			 if (AMIGA.dmaen(DMAF_SPREN) && (bplcon0 & 1) && (bplcon3 & 0x02) && !(bplcon3 & 0x20) && nr > 0) {
			 var j, jj;
			 for (j = 0, jj = 0; j < sprite_width; j+= 16, jj++) {
			 var nx = fromspritexdiw (posns[i] + j);
			 if (sprdata[nr][jj] || sprdatb[nr][jj]) {
			 if (diwfirstword_total > nx && nx >= (48 << currprefs.hresolution))
			 diwfirstword_total = nx;
			 if (diwlastword_total < nx + 16 && nx <= (448 << currprefs.hresolution))
			 diwlastword_total = nx + 16;
			 }
			 }
			 gotdata = 1;
			 }
			 #endif*/
		}
		last_sprite_point = point;

		/* get upper and lower sprite position if brdsprt enabled */
		/*#if AUTOSCALE_SPRITES
		 if (gotdata) {
		 if (vpos < first_planes_vpos)
		 first_planes_vpos = vpos;
		 if (vpos < plffirstline_total)
		 plffirstline_total = vpos;
		 if (vpos > last_planes_vpos)
		 last_planes_vpos = vpos;
		 if (vpos > plflastline_total)
		 plflastline_total = vpos;
		 }
		 #endif*/
	};
	
	this.cursorsprite = function () {
		if (!AMIGA.dmaen(DMAF_SPREN) || first_planes_vpos == 0)
			return;
		sprite_0 = spr[0].pt;
		sprite_0_height = spr[0].vstop - spr[0].vstart;
		sprite_0_colors[0] = 0;
		sprite_0_doubled = 0;
		if (sprres == 0)
			sprite_0_doubled = 1;
		if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			var sbasecol = ((bplcon4 >> 4) & 15) << 4;
			sprite_0_colors[1] = current_colors.color_regs_aga[sbasecol + 1];
			sprite_0_colors[2] = current_colors.color_regs_aga[sbasecol + 2];
			sprite_0_colors[3] = current_colors.color_regs_aga[sbasecol + 3];
		} else {
			sprite_0_colors[1] = xcolors[current_colors.color_regs_ecs[17]];
			sprite_0_colors[2] = xcolors[current_colors.color_regs_ecs[18]];
			sprite_0_colors[3] = xcolors[current_colors.color_regs_ecs[19]];
		}
		sprite_0_width = sprite_width;
		/*if (currprefs.input_tablet && currprefs.input_magic_mouse) {
		 if (currprefs.input_magic_mouse_cursor == MAGICMOUSE_HOST_ONLY && mousehack_alive ())
		 magic_sprite_mask &= ~1;
		 else
		 magic_sprite_mask |= 1;
		 }*/
	};	
	
	function sprite_fetch(s, dma, hpos, cycle, mode) {
		var data = AMIGA.custom.last_value;
		if (dma) {
			//data = AMIGA.mem.load16_chip(s.pt);
			data = AMIGA.custom.last_value = AMIGA.mem.chip.data[s.pt >>> 1];
		}
		s.pt += 2;
		return data;
	}
	function sprite_fetch2(s, hpos, cycle, mode) {
		//var data = AMIGA.mem.load16_chip(s.pt);
		var data = AMIGA.custom.last_value = AMIGA.mem.chip.data[s.pt >>> 1];
		s.pt += 2;
		return data;
	}

	this.do_sprites_1 = function (num, cycle, hpos) {
		var s = spr[num];
		var isdma = AMIGA.dmaen(DMAF_SPREN) || ((num & 1) && spr[num & ~1].dmacycle);

		if (isdma && this.vpos == sprite_vblank_endline)
			spr_arm(num, 0);
		/*#ifdef AGA
		 if (isdma && s.dblscan && (fmode & 0x8000) && (this.vpos & 1) != (s.vstart & 1) && s.dmastate) {
		 spr_arm(num, 1);
		 return;
		 }
		 #endif*/

		//if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:slot%d:%d', this.vpos, hpos, num, cycle);

		if (this.vpos == s.vstart) {
			//if (!s.dmastate && this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%d START', this.vpos, hpos, num);
			s.dmastate = 1;
			if (num == 0 && cycle == 0)
				this.cursorsprite();
		}
		if (this.vpos == s.vstop || this.vpos == sprite_vblank_endline) {
			//if (s.dmastate && this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%d STOP', this.vpos, hpos, num);
			s.dmastate = 0;
			/*#if 0
			 // roots 2.0 flower zoomer bottom part missing if this enabled
			 if (this.vpos == s.vstop) {
			 spr_arm (num, 0);
			 //return;
			 }
			 #endif*/
		}

		if (!isdma)
			return;
		if (cycle && !s.dmacycle)
			return;
		/* Superfrog intro flashing bee fix */

		var dma = hpos < plfstrt_sprite || diwstate != DIW_WAITING_STOP;
		var posctl = 0;

		if (this.vpos == s.vstop || this.vpos == sprite_vblank_endline) {
			s.dmastate = 0;
			posctl = 1;
			if (dma) {
				var data = sprite_fetch(s, dma, hpos, cycle, 0);
				switch (sprite_width) {
					case 64:
						sprite_fetch2(s, hpos, cycle, 0);
						sprite_fetch2(s, hpos, cycle, 0);
						break;
					case 32:
						sprite_fetch2(s, hpos, cycle, 0);
						break;
				}
				//BUG.info('%d:%d: %04X=%04X', this.vpos, hpos, 0x140 + cycle * 2 + num * 8, data);
				if (cycle == 0) {
					this.SPRxPOS_1(data, num, hpos);
					s.dmacycle = 1;
				} else {
					this.SPRxCTL_1(data, num, hpos);
					s.dmastate = 0;
					this.sprstartstop(s);
				}
			}
			//if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:dma:P=%06X '), this.vpos, hpos, s.pt);
		}
		if (s.dmastate && !posctl && dma) {
			var data = sprite_fetch(s, dma, hpos, cycle, 1);
			//if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:dma:P=%06X '), this.vpos, hpos, s.pt);
			if (cycle == 0) {
				this.SPRxDATA_1(data, num, hpos);
				s.dmacycle = 1;
			} else {
				this.SPRxDATB_1(data, num, hpos);
				spr_arm(num, 1);
			}
			/*#ifdef AGA
			 switch (sprite_width) {
			 case 64: {
			 var data32 = sprite_fetch2 (s, hpos, cycle, 1);
			 var data641 = sprite_fetch2 (s, hpos, cycle, 1);
			 var data642 = sprite_fetch2 (s, hpos, cycle, 1);
			 if (dma) {
			 if (cycle == 0) {
			 sprdata[num][3] = data642;
			 sprdata[num][2] = data641;
			 sprdata[num][1] = data32;
			 } else {
			 sprdatb[num][3] = data642;
			 sprdatb[num][2] = data641;
			 sprdatb[num][1] = data32;
			 }
			 }
			 }
			 break;
			 case 32: {
			 var data32 = sprite_fetch2 (s, hpos, cycle, 1);
			 if (dma) {
			 if (cycle == 0)
			 sprdata[num][1] = data32;
			 else
			 sprdatb[num][1] = data32;
			 }
			 }
			 break;
			 }
			 #endif*/
		}
	};

	this.do_sprites = function (hpos) {
		if (!DO_SPRITES) return; //FIXME
		if (this.vpos < sprite_vblank_endline)
			return;

		if (this.doflickerfix() && interlace_seen && (next_lineno & 1))
			return;

		if (!CUSTOM_SIMPLE) {
			var minspr = last_sprite_hpos + 1;
			var maxspr = hpos;

			if (minspr >= maxspr || last_sprite_hpos == hpos)
				return;

			if (maxspr >= SPR0_HPOS + MAX_SPRITES * 4)
				maxspr = SPR0_HPOS + MAX_SPRITES * 4 - 1;
			if (minspr < SPR0_HPOS)
				minspr = SPR0_HPOS;

			if (minspr == maxspr)
				return;

			for (var i = minspr; i <= maxspr; i++) {
				var cycle = -1;
				var num = (i - SPR0_HPOS) >> 2;
				switch ((i - SPR0_HPOS) & 3) {
					case 0:
						cycle = 0;
						spr[num].dmacycle = 0;
						break;
					case 2:
						cycle = 1;
						break;
				}
				if (cycle >= 0) {
					spr[num].ptxhpos = MAXHPOS;
					this.do_sprites_1(num, cycle, i);
				}
			}
			last_sprite_hpos = hpos;
		} else {
			for (var i = 0; i < MAX_SPRITES * 2; i++) {
				spr[i >> 1].dmacycle = 1;
				this.do_sprites_1(i >> 1, i & 1, 0);
			}
		}
	};

	function expand_sprres(con0, con3) {
		switch ((con3 >> 6) & 3) {
			case 0: {
				if ((AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && GET_RES_DENISE(con0) == RES_SUPERHIRES)
					return RES_HIRES;
				else
					return RES_LORES;
			}
/*#ifdef AGA
			case 1:
				return RES_LORES;
			case 2:
				return RES_HIRES;
			case 3:
				return RES_SUPERHIRES;
#endif*/
			default:
				return RES_LORES;
		}
	}

	function spr_arm(num, state) {
		switch (state) {
			case 0:
				nr_armed -= spr[num].armed;
				spr[num].armed = 0;
				break;
			default:
				nr_armed += 1 - spr[num].armed;
				spr[num].armed = 1;
				break;
		}    
	}

	this.sprstartstop = function (s) {
		if (this.vpos == s.vstart)
			s.dmastate = 1;
		if (this.vpos == s.vstop)
			s.dmastate = 0;
	};

	this.CLXCON = function (v) {
		clxcon = v;
		clxcon_bpl_enable = (v >> 6) & 63;
		clxcon_bpl_match = v & 63;
	};

	this.CLXCON2 = function (v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			return;
		clxcon2 = v;
		clxcon_bpl_enable |= v & (0x40 | 0x80);
		clxcon_bpl_match |= (v & (0x01 | 0x02)) << 6;
	};

	this.CLXDAT = function () {
		var v = clxdat | 0x8000;
		clxdat = 0;
		return v;
	};
	
	this.SPRxCTLPOS = function (num) {
		var sprxp;
		var s = spr[num];

		this.sprstartstop(s);
		sprxp = (sprpos[num] & 0xFF) * 2 + (sprctl[num] & 1);
		sprxp <<= sprite_buffer_res;
		/*#ifdef AGA
		 if (AMIGA.config.chipset.mask & CSMASK_AGA) {
		 sprxp |= ((sprctl[num] >> 3) & 3) >> (RES_MAX - sprite_buffer_res);
		 s.dblscan = sprpos[num] & 0x80;
		 } else
		 #endif*/
		if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) {
			sprxp |= ((sprctl[num] >> 3) & 2) >> (RES_MAX - sprite_buffer_res);
		}
		s.xpos = sprxp;
		s.vstart = (sprpos[num] >> 8) | ((sprctl[num] << 6) & 0x100);
		s.vstop = (sprctl[num] >> 8) | ((sprctl[num] << 7) & 0x100);
		if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
			s.vstart |= (sprctl[num] << 3) & 0x200;
			s.vstop |= (sprctl[num] << 4) & 0x200;
		}
		this.sprstartstop(s);
	};

	this.SPRxCTL_1 = function (v, num, hpos) {
		//struct sprite *s = &spr[num];
		sprctl[num] = v;
		spr_arm(num, 0);
		this.SPRxCTLPOS(num);
		/*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
		 BUG.info('%d:%d:SPR%dCTL %04X P=%06X VSTRT=%d VSTOP=%d HSTRT=%d D=%d A=%d CP=%x PC=%x', this.vpos, hpos, num, v, s->pt, s->vstart, s->vstop, s->xpos, spr[num].dmastate, spr[num].armed, cop_state.ip, M68K_GETPC);
		 }*/
	};

	this.SPRxPOS_1 = function (v, num, hpos) {
		//struct sprite *s = &spr[num];
		sprpos[num] = v;
		this.SPRxCTLPOS(num);
		/*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
		 BUG.info('%d:%d:SPR%dPOS %04X P=%06X VSTRT=%d VSTOP=%d HSTRT=%d D=%d A=%d CP=%x PC=%x', this.vpos, hpos, num, v, s->pt, s->vstart, s->vstop, s->xpos, spr[num].dmastate, spr[num].armed, cop_state.ip, M68K_GETPC);
		 }*/
	};

	this.SPRxDATA_1 = function (v, num, hpos) {
		sprdata[num][0] = v;
		/*#ifdef AGA
		 sprdata[num][1] = v;
		 sprdata[num][2] = v;
		 sprdata[num][3] = v;
		 #endif*/
		spr_arm(num, 1);
		/*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
		 BUG.info('%d:%d:SPR%dDATA %04X P=%06X D=%d A=%d PC=%x', this.vpos, hpos, num, v, spr[num].pt, spr[num].dmastate, spr[num].armed, M68K_GETPC);
		 }*/
	};

	this.SPRxDATB_1 = function (v, num, hpos) {
		sprdatb[num][0] = v;
		/*#ifdef AGA
		 sprdatb[num][1] = v;
		 sprdatb[num][2] = v;
		 sprdatb[num][3] = v;
		 #endif*/
		/*if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) {
		 BUG.info('%d:%d:SPR%dDATB %04X P=%06X D=%d A=%d PC=%x', this.vpos, hpos, num, v, spr[num].pt, spr[num].dmastate, spr[num].armed, M68K_GETPC);
		 }*/
	};
	
	this.SPRxDATA = function (hpos, v, num) {
		this.decide_sprites(hpos);
		this.SPRxDATA_1(v, num, hpos);
	};
	this.SPRxDATB = function (hpos, v, num) {
		this.decide_sprites(hpos);
		this.SPRxDATB_1(v, num, hpos);
	};
	this.SPRxCTL = function (hpos, v, num) {
		this.decide_sprites(hpos);
		this.SPRxCTL_1(v, num, hpos);
	};
	this.SPRxPOS = function (hpos, v, num) {
		this.decide_sprites(hpos);
		this.SPRxPOS_1(v, num, hpos);
	};

	this.SPRxPTH = function (hpos, v, num) {
		this.decide_sprites(hpos);
		if (hpos - 1 != spr[num].ptxhpos) {
			spr[num].pt = ((v << 16) | (spr[num].pt & 0xffff)) >>> 0;
		}
		//if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%dPTH %06X', this.vpos, hpos, num, spr[num].pt);
	};
	this.SPRxPTL = function (hpos, v, num) {
		this.decide_sprites(hpos);
		if (hpos - 1 != spr[num].ptxhpos) {
			spr[num].pt = ((spr[num].pt & 0xffff0000) | (v & 0xfffe)) >>> 0;
		}
		//if (this.vpos >= SPRITE_DEBUG_MINY && this.vpos <= SPRITE_DEBUG_MAXY) BUG.info('%d:%d:SPR%dPTL %06X', this.vpos, hpos, num, spr[num].pt);
	};

	this.setup_sprites = function () {
		if (!sprinit) {
			sprinit = true;
			setup_sprite_tables();
		}
	};
	
	this.cleanup_sprites = function () {
	};
	
	this.reset_sprites = function () {
		var i;
		for (i = 0; i < sprpos.length; i++) sprpos[i] = 0; //memset (sprpos, 0, sizeof sprpos);
		for (i = 0; i < sprctl.length; i++) sprctl[i] = 0; //memset (sprctl, 0, sizeof sprctl);		

		for (i = 0; i < spixels.length; i++) spixels[i] = 0; //memset(spixels, 0, sizeof spixels);       
		for (i = 0; i < spixstate.length; i++) spixstate[i] = 0; //memset(&spixstate, 0, sizeof spixstate);  
	};
	
	/*-----------------------------------------------------------------------*/
	/* playfield */
	/*-----------------------------------------------------------------------*/
	
	/*function debug_cycle_diagram() {
		var fm, res, planes, cycle, v;
		var aa, txt = '';

		for (fm = 0; fm <= 2; fm++) {
			txt += sprintf('FMODE %d\n=======\n', fm);
			for (res = 0; res <= 2; res++) {
				for (planes = 0; planes <= 8; planes++) {
					txt += sprintf('%d: ',planes);
					for (cycle = 0; cycle < 32; cycle++) {
						v = cycle_diagram_table[fm][res][planes][cycle];
						if (v == 0) aa='-'; else if (v > 0) aa='1'; else aa='X';
						txt += sprintf('%s', aa);
					}
					txt += sprintf(' %d:%d\n', cycle_diagram_free_cycles[fm][res][planes], cycle_diagram_total_cycles[fm][res][planes]);
				}
				txt += sprintf('\n');
			}
		}
		BUG.info(txt);		
	}*/
	
	function create_cycle_diagram_table() {
		var fm, res, cycle, planes, rplanes, v;
		var fetch_start, max_planes, freecycles;
		var cycle_sequence;
		var i, j, k, l;
		
		for (i = 0; i < 3; i++) {
			real_bitplane_number[i] = [];			
			cycle_diagram_free_cycles[i] = [];			
			cycle_diagram_total_cycles[i] = [];			
			for (j = 0; j < 3; j++) {
				real_bitplane_number[i][j] = [];			
				cycle_diagram_free_cycles[i][j] = [];			
				cycle_diagram_total_cycles[i][j] = [];			
				for (k = 0; k < 9; k++) {
					real_bitplane_number[i][j][k] = 0;			
					cycle_diagram_free_cycles[i][j][k] = 0;			
					cycle_diagram_total_cycles[i][j][k] = 0;			
				}
			}
		}
		cycle_diagram_table = [];			
		for (i = 0; i < 3; i++) {
			cycle_diagram_table[i] = [];			
			for (j = 0; j < 3; j++) {
				cycle_diagram_table[i][j] = [];			
				for (k = 0; k < 9; k++) {
					cycle_diagram_table[i][j][k] = [];			
					for (l = 0; l < 32; l++)
						cycle_diagram_table[i][j][k][l] = 0;			
				}
			}
		}
		
		for (fm = 0; fm <= 2; fm++) {
			for (res = 0; res <= 2; res++) {
				max_planes = fm_maxplanes[fm * 4 + res];
				fetch_start = 1 << fetchstarts[fm * 4 + res];
				cycle_sequence = cycle_sequences[max_planes - 1];
				max_planes = 1 << max_planes;
				for (planes = 0; planes <= 8; planes++) {
					freecycles = 0;
					for (cycle = 0; cycle < 32; cycle++)
						cycle_diagram_table[fm][res][planes][cycle] = -1;
					if (planes <= max_planes) {
						for (cycle = 0; cycle < fetch_start; cycle++) {
							if (cycle < max_planes && planes >= cycle_sequence[cycle & 7]) {
								v = cycle_sequence[cycle & 7];
							} else {
								v = 0;
								freecycles++;
							}
							cycle_diagram_table[fm][res][planes][cycle] = v;
						}
					}
					cycle_diagram_free_cycles[fm][res][planes] = freecycles;
					cycle_diagram_total_cycles[fm][res][planes] = fetch_start;
					rplanes = planes;
					if (rplanes > max_planes)
						rplanes = 0;
					if (rplanes == 7 && fm == 0 && res == 0 && !(AMIGA.config.chipset.mask & CSMASK_AGA))
						rplanes = 4;
					real_bitplane_number[fm][res][planes] = rplanes;
				}
			}
		}
		//debug_cycle_diagram();
	}

	/*---------------------------------*/

	function doMask(p, bits, shift) {
		/* scale to 0..255, shift to align msb with mask, and apply mask */

		//if (flashscreen) p ^= 0xff;
		var val = (p << 24) >>> 0;
		if (!bits)
			return 0;
		val >>>= (32 - bits);
		val <<= shift;

		return val >>> 0;
	}
	function doAlpha (alpha, bits, shift) {
		return ((alpha & ((1 << bits) - 1)) << shift) >>> 0;
	}
	function alloc_colors64k (rw, gw, bw, rs, gs, bs, aw, as, alpha, byte_swap) {
		//#define bswap_16(x) (((x) >> 8) | (((x) & 0xFF) << 8))
		//#define bswap_32(x) (((x) << 24) | (((x) << 8) & 0x00FF0000) | (((x) >> 8) & 0x0000FF00) | ((x) >> 24))
		var bpp = rw + gw + bw + aw;
		//var j = 256;

		//video_calc_gammatable();
		for (var i = 0; i < 4096; i++) {
			var r = ((i >> 8) << 4) | (i >> 8);
			var g = (((i >> 4) & 0xf) << 4) | ((i >> 4) & 0x0f);
			var b = ((i & 0xf) << 4) | (i & 0x0f);
			//r = gamma[r + j];
			//g = gamma[g + j];
			//b = gamma[b + j];
			xcolors[i] = (doMask(r, rw, rs) | doMask(g, gw, gs) | doMask(b, bw, bs) | doAlpha(alpha, aw, as)) >>> 0;
			if (byte_swap) {
				if (bpp <= 16)
					xcolors[i] = bswap_16(xcolors[i]);
				else
					xcolors[i] = bswap_32(xcolors[i]);
			}
			if (bpp <= 16) {
				/* Fill upper 16 bits of each colour value
				* with a copy of the colour. */
				xcolors[i] |= xcolors[i] * 0x00010001;
				xcolors[i] >>>= 0;
			}
		}
		//console.log('alloc_colors64k', xcolors);
	}	
				
	function update_mirrors() {
		aga_mode = (AMIGA.config.chipset.mask & CSMASK_AGA) != 0;
		direct_rgb = aga_mode;
	}	
	
	function docols(colentry) {
/*#ifdef AGA
		if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			for (var i = 0; i < 256; i++) {
				var v = color_reg_get (colentry, i);
				if (v < 0 || v > 16777215)
					continue;
				colentry->acolors[i] = getxcolor (v);
			}
		} else {
#endif*/
			for (var i = 0; i < 32; i++) {
				var v = color_reg_get(colentry, i);
				if (v < 0 || v > 4095)
					continue;
				colentry.acolors[i] = getxcolor(v);
			}
/*#ifdef AGA
		}
#endif*/
	}
	function notice_new_xcolors() {
		update_mirrors();
		docols(current_colors);
		docols(colors_for_drawing);
		for (var i = 0; i < (MAXVPOS + 1) * 2; i++) {
			docols(color_tables[0][i]);
			docols(color_tables[1][i]);
		}
	}
	
	/*---------------------------------*/

	function getxcolor(c) {
/*#ifdef AGA
		if (direct_rgb)
			return CONVERT_RGB(c);
		else
#endif*/
		return xcolors[c];
	}

	function color_reg_get(ce, c) {
/*#ifdef AGA
		if (aga_mode)
			return ce.color_regs_aga[c];
		else
#endif*/
			return ce.color_regs_ecs[c];
	}

	function color_reg_set(ce, c, v) {
/*#ifdef AGA
		if (aga_mode)
			ce.color_regs_aga[c] = v;
		else
#endif*/
			ce.color_regs_ecs[c] = v;
	}
	
	function color_reg_cmp(ce1, ce2) {
/*#ifdef AGA
		if (aga_mode) {
			v = memcmp (ce1->color_regs_aga, ce2->color_regs_aga, sizeof (uae_u32) * 256);
		} else
#endif*/
		{
			//v = memcmp (ce1.color_regs_ecs, ce2.color_regs_ecs, sizeof (uae_u16) * 32);
			for (var i = 0; i < 32; i++) {
				if (ce1.color_regs_ecs[i] != ce2.color_regs_ecs[i])
					return 1;
			}	
			return ce1.borderblank == ce2.borderblank ? 0 : 1;
		}
	}
	
	function color_reg_cpy(dst, src) {
		dst.borderblank = src.borderblank;
/*#ifdef AGA
		if (aga_mode)
			//copy acolors and color_regs_aga
			memcpy (dst->acolors, src->acolors, sizeof(struct ColorEntry) - sizeof(uae_u16) * 32);
		else
#endif*/
		//copy first 32 acolors and color_regs_ecs
		//memcpy (dst.color_regs_ecs, src.color_regs_ecs, sizeof(struct ColorEntry));
		
		for (var i = 0; i < 32; i++) {
			dst.acolors[i] = src.acolors[i];
			dst.color_regs_ecs[i] = src.color_regs_ecs[i];
		}
		//console.log('color_reg_cpy()', dst, src);		
	}	
	
	function color_reg_cpy_acolors(dst, src) {
		dst.borderblank = src.borderblank;
		for (var i = 0; i < dst.acolors.length; i++)
			dst.acolors[i] = src.acolors[i];
	}	
	
	/*---------------------------------*/

	this.remember_ctable = function () {
		if (next_color_entry >= COLOR_TABLE_SIZE) {
			BUG.info('remember_ctable() BUG', next_color_entry);
			return;
		}
		if (remembered_color_entry < 0) {
			color_reg_cpy(curr_color_tables[next_color_entry], current_colors);
			remembered_color_entry = next_color_entry++;
		}
		thisline_decision.ctable = remembered_color_entry;

		if (color_src_match < 0 || color_dest_match != remembered_color_entry || line_decisions[next_lineno].ctable != color_src_match) {
			var oldctable = line_decisions[next_lineno].ctable;
			var changed = 0;

			if (oldctable < 0) {
				changed = 1;
				color_src_match = color_dest_match = -1;
			} else {
				color_compare_result = color_reg_cmp(prev_color_tables[oldctable], current_colors) != 0;
				if (color_compare_result)
					changed = 1;
				color_src_match = oldctable;
				color_dest_match = remembered_color_entry;
			}
			thisline_changed |= changed;
		} else {
			if (color_compare_result)
				thisline_changed = 1;
		}
	};

	this.record_color_change2 = function (hpos, regno, value) {
		//if (FAST_COLORS) //en for better?
		//return;
		var pos = hpos * 2;
		if (regno == 0x1000 + 0x10c) pos++; // BPLCON4 change needs 1 lores pixel delay
		curr_color_changes[next_color_change].linepos = pos;
		curr_color_changes[next_color_change].regno = regno;
		curr_color_changes[next_color_change++].value = value;
		curr_color_changes[next_color_change].regno = -1;
		//console.log('record_color_change2()', next_color_change); 
	};
	
	this.record_color_change = function (hpos, regno, value) {
		if (FAST_COLORS)
			return;
		if (this.vpos < minfirstline || (regno < 0x1000 && this.nodraw()))
			return;

		this.decide_diw(hpos);
		this.decide_line(hpos);

		if (thisline_decision.ctable < 0)
			this.remember_ctable();

		if ((regno < 0x1000 || regno == 0x1000 + 0x10c) && hpos < HBLANK_OFFSET && !(beamcon0 & 0x80) && prev_lineno >= 0) {
			var pdip = curr_drawinfo[prev_lineno];
			var idx = pdip.last_color_change;
			var extrahpos = regno == 0x1000 + 0x10c ? 1 : 0;
			var lastsync = false;

			if (idx > 0 && curr_color_changes[idx - 1].regno == 0xffff) {
				idx--;
				lastsync = true;
			}
			pdip.last_color_change++;
			pdip.nr_color_changes++;
			curr_color_changes[idx].linepos = (hpos + this.maxhpos) * 2 + extrahpos;
			curr_color_changes[idx].regno = regno;
			curr_color_changes[idx].value = value;
			if (lastsync) {
				curr_color_changes[idx + 1].linepos = hsyncstartpos * 2;
				curr_color_changes[idx + 1].regno = 0xffff;
				curr_color_changes[idx + 2].regno = -1;
			} else
				curr_color_changes[idx + 1].regno = -1;
		}
		this.record_color_change2(hpos, regno, value);
	};	
	
	this.isbrdblank = function (hpos, con0, con3) {
		var brdblank = (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) != 0 && (con0 & 1) != 0 && (con3 & 0x20) != 0;

		if (hpos >= 0 && current_colors.borderblank != brdblank) {
			if (!FAST_COLORS) {
				this.record_color_change(hpos, 0, (COLOR_CHANGE_BRDBLANK | (brdblank ? 1 : 0)) >>> 0);
				remembered_color_entry = -1;
			}
			current_colors.borderblank = brdblank;
		}
		return brdblank;
	};

	this.record_register_change = function (hpos, regno, value) {
		if (regno == 0x100) { // BPLCON0
			if (value & 0x800)
				thisline_decision.ham_seen = 1;
			thisline_decision.ehb_seen = is_ehb(value, bplcon2);
			this.isbrdblank(hpos, value, bplcon3);
		} else if (regno == 0x104) // BPLCON2
			thisline_decision.ehb_seen = is_ehb(bplcon0, value);
		else if (regno == 0x106) // BPLCON3
			this.isbrdblank(hpos, bplcon0, value);

		if (!FAST_COLORS)
			this.record_color_change(hpos, regno + 0x1000, value);
	};	
	
	/*---------------------------------*/	
	
	this.compute_vsynctime = function () {
		if (AMIGA.config.chipset.refreshrate > 0)
			this.vblank_hz = AMIGA.config.chipset.refreshrate;

		AMIGA.events.calc_vsynctimebase(this.vblank_hz);

		if (AMIGA.config.audio.enabled && AMIGA.config.audio.mode > 0)
			AMIGA.audio.calc_sample_evtime(this.vblank_hz, (bplcon0 & 4) ? -1 : this.lof_store, this.is_linetoggle());
	};

	this.compute_framesync = function () {
		var islace = interlace_seen ? 1 : 0;
		var isntsc = (beamcon0 & 0x20) ? 0 : 1;

		interlace_changed = 0;
		gfxvidinfo.drawbuffer.inxoffset = -1;
		gfxvidinfo.drawbuffer.inyoffset = -1;

		if (beamcon0 & 0x80) {
			//var res = GET_RES_AGNUS(bplcon0);
			//var vres = islace ? 1 : 0;
			var res2, vres2;

			res2 = AMIGA.config.video.hresolution;
			if (doublescan > 0)
				res2++;
			if (res2 > RES_MAX)
				res2 = RES_MAX;

			vres2 = AMIGA.config.video.vresolution;
			if (doublescan > 0 && !islace)
				vres2--;

			if (vres2 < 0)
				vres2 = 0;
			if (vres2 > VRES_QUAD)
				vres2 = VRES_QUAD;

			var start = this.hbstrt;
			var stop = this.hbstop;

			gfxvidinfo.drawbuffer.inwidth = (((start > stop ? (this.maxhpos - (this.maxhpos - start + stop)) : (this.maxhpos - (stop - start) + 2)) * 2) << res2);
			gfxvidinfo.drawbuffer.inxoffset = ((stop + 1) & ~1) * 2;

			gfxvidinfo.drawbuffer.extrawidth = 0;
			gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.inwidth;

			gfxvidinfo.drawbuffer.inheight = (this.maxvpos - minfirstline) << vres2;
			gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.inheight;
		} else {
			gfxvidinfo.drawbuffer.inwidth = AMIGA_WIDTH_MAX << AMIGA.config.video.hresolution;
			gfxvidinfo.drawbuffer.extrawidth = AMIGA.config.video.extrawidth ? AMIGA.config.video.extrawidth : -1;
			gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.inwidth;
			gfxvidinfo.drawbuffer.inheight = (this.maxvpos_nom - minfirstline + 1) << AMIGA.config.video.vresolution;
			gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.inheight;
		}

		if (gfxvidinfo.drawbuffer.inwidth > gfxvidinfo.drawbuffer.width_allocated)
			gfxvidinfo.drawbuffer.inwidth = gfxvidinfo.drawbuffer.width_allocated;
		if (gfxvidinfo.drawbuffer.inwidth2 > gfxvidinfo.drawbuffer.width_allocated)
			gfxvidinfo.drawbuffer.inwidth2 = gfxvidinfo.drawbuffer.width_allocated;

		if (gfxvidinfo.drawbuffer.inheight > gfxvidinfo.drawbuffer.height_allocated)
			gfxvidinfo.drawbuffer.inheight = gfxvidinfo.drawbuffer.height_allocated;
		if (gfxvidinfo.drawbuffer.inheight2 > gfxvidinfo.drawbuffer.height_allocated)
			gfxvidinfo.drawbuffer.inheight2 = gfxvidinfo.drawbuffer.height_allocated;

		gfxvidinfo.drawbuffer.outwidth = gfxvidinfo.drawbuffer.inwidth;
		gfxvidinfo.drawbuffer.outheight = gfxvidinfo.drawbuffer.inheight;

		if (gfxvidinfo.drawbuffer.outwidth > gfxvidinfo.drawbuffer.width_allocated)
			gfxvidinfo.drawbuffer.outwidth = gfxvidinfo.drawbuffer.width_allocated;

		if (gfxvidinfo.drawbuffer.outheight > gfxvidinfo.drawbuffer.height_allocated)
			gfxvidinfo.drawbuffer.outheight = gfxvidinfo.drawbuffer.height_allocated;

		//if (target_graphics_buffer_update()) this.reset_drawing();

		for (var i = 0; i < 2 * (MAXVPOS + 2) + 1; i++) //memset (line_decisions, 0, sizeof line_decisions); 
			line_decisions[i].clr();

		this.compute_vsynctime();

		BUG.info('%s mode%s%s V=%.4fHz H=%.4fHz (%dx%d+%d)',
			isntsc ? 'NTSC' : 'PAL',
			islace ? ' lace' : '',
			doublescan > 0 ? ' dblscan' : '',
			this.vblank_hz,
			(AMIGA.config.video.ntsc ? CHIPSET_CLOCK_NTSC : CHIPSET_CLOCK_PAL) / (this.maxhpos + (this.is_linetoggle() ? 0.5 : 0)),
			this.maxhpos, this.maxvpos, this.lof_store ? 1 : 0
		);
	};

	this.init_hz = function (fullinit) {
		var isntsc, islace;
		var odbl = doublescan, omaxvpos = this.maxvpos;
		var hzc = 0;

		if (fullinit)
			this.vpos_count = 0;

		this.vpos_count_diff = this.vpos_count;

		doublescan = 0;
		//programmedmode = false;
		if ((beamcon0 & 0xA0) != (new_beamcon0 & 0xA0))
			hzc = 1;
		if (beamcon0 != new_beamcon0) {
			BUG.info('init_hz() BEAMCON0 %04x -> %04x', beamcon0, new_beamcon0);
			this.vpos_count_diff = this.vpos_count = 0;
		}
		beamcon0 = new_beamcon0;
		isntsc = (beamcon0 & 0x20) ? 0 : 1;
		islace = (interlace_seen) ? 1 : 0;
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			isntsc = AMIGA.config.video.ntsc ? 1 : 0;
		if (!isntsc) {
			this.maxvpos = MAXVPOS_PAL;
			this.maxhpos = MAXHPOS_PAL;
			this.vblank_hz = VBLANK_HZ_PAL;
			minfirstline = VBLANK_ENDLINE_PAL;
			sprite_vblank_endline = VBLANK_SPRITE_PAL;
			equ_vblank_endline = EQU_ENDLINE_PAL;
			equ_vblank_toggle = true;
		} else {
			this.maxvpos = MAXVPOS_NTSC;
			this.maxhpos = MAXHPOS_NTSC;
			this.vblank_hz = VBLANK_HZ_NTSC;
			minfirstline = VBLANK_ENDLINE_NTSC;
			sprite_vblank_endline = VBLANK_SPRITE_NTSC;
			equ_vblank_endline = EQU_ENDLINE_NTSC;
			equ_vblank_toggle = false;
		}
		// long/short field refresh rate adjustment
		this.vblank_hz = this.vblank_hz * (this.maxvpos * 2 + 1) / ((this.maxvpos + this.lof_current) * 2);

		this.maxvpos_nom = this.maxvpos;
		if (this.vpos_count > 0) {
			BUG.info('init_hz() poked VPOSW at %d', this.vpos_count);
			// we come here if this.vpos_count != this.maxvpos and beamcon0 didn't change (someone poked VPOSW)
			if (this.vpos_count < 10)
				this.vpos_count = 10;
			this.vblank_hz = (isntsc ? 15734 : 15625) / this.vpos_count;
			this.maxvpos_nom = this.vpos_count - (this.lof_current ? 1 : 0);
			this.reset_drawing();
		}
		if (beamcon0 & 0x80) {
			// programmable scanrates (ECS Agnus)
			if (this.vtotal >= MAXVPOS)
				this.vtotal = MAXVPOS - 1;
			this.maxvpos = this.vtotal + 1;
			if (this.htotal >= MAXHPOS)
				this.htotal = MAXHPOS - 1;
			this.maxhpos = this.htotal + 1;
			this.vblank_hz = 227 * 312 * 50 / (this.maxvpos * this.maxhpos);
			minfirstline = this.vsstop > this.vbstop ? this.vsstop : this.vbstop;
			if (minfirstline > this.maxvpos / 2)
				minfirstline = this.vsstop > this.vsstop ? this.vbstop : this.vsstop;
			if (minfirstline < 2)
				minfirstline = 2;
			if (minfirstline >= this.maxvpos)
				minfirstline = this.maxvpos - 1;
			sprite_vblank_endline = minfirstline - 2;
			this.maxvpos_nom = this.maxvpos;
			equ_vblank_endline = -1;
			doublescan = this.htotal <= 164 ? 1 : 0;
			//programmedmode = true;
			this.dumpsync();
			hzc = 1;
		}
		if (this.maxvpos_nom >= MAXVPOS)
			this.maxvpos_nom = MAXVPOS;
		if (AMIGA.config.video.scandoubler && doublescan == 0)
			doublescan = -1;

		if (doublescan != odbl || this.maxvpos != omaxvpos)
			hzc = 1;
		if (this.vblank_hz < 10)
			this.vblank_hz = 10;
		if (this.vblank_hz > 300)
			this.vblank_hz = 300;
		this.maxhpos_short = this.maxhpos;
		if (beamcon0 & 0x80) {
			if (this.hbstrt > this.maxhpos)
				hsyncstartpos = this.hbstrt;
			else
				hsyncstartpos = this.maxhpos + this.hbstrt;
			if (this.hbstop > this.maxhpos)
				hsyncendpos = this.maxhpos - this.hbstop;
			else
				hsyncendpos = this.hbstop;
		} else {
			hsyncstartpos = this.maxhpos_short + 13;
			hsyncendpos = 24;
		}

		AMIGA.events.eventtab[EV_HSYNC].evtime = AMIGA.events.currcycle + this.maxhpos * CYCLE_UNIT;
		AMIGA.events.eventtab[EV_HSYNC].oldcycles = AMIGA.events.currcycle;
		AMIGA.events.schedule();

		if (hzc) {
			interlace_seen = islace;
			this.reset_drawing();
		}

		this.maxvpos_total = (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) ? 2047 : 511;
		if (this.maxvpos_total > MAXVPOS)
			this.maxvpos_total = MAXVPOS;
		/*#ifdef PICASSO96
		 if (!p96refresh_active) {
		 maxvpos_stored = this.maxvpos;
		 maxhpos_stored = this.maxhpos;
		 vblank_hz_stored = this.vblank_hz;
		 }
		 #endif*/
		this.compute_framesync();
		/*#ifdef PICASSO96
		 init_hz_p96 ();
		 #endif*/
		if (fullinit)
			this.vpos_count_diff = this.maxvpos_nom;
	};
	
	this.BPLxPTH = function (hpos, v, num) {
		this.decide_line(hpos);
		this.decide_fetch(hpos);
		bplpt[num] = ((v << 16) | (bplpt[num] & 0xffff)) >>> 0;
		bplptx[num] = ((v << 16) | (bplptx[num] & 0xffff)) >>> 0;
		//BUG.info('%d:%d:BPL%dPTH %08X', hpos, this.vpos, num, bplpt[num]);
	};

	this.BPLxPTL = function (hpos, v, num) {
		this.decide_line(hpos);
		this.decide_fetch(hpos);
		//if (AMIGA.copper.access && this.is_bitplane_dma(hpos + 1) == num + 1) return;

		bplpt[num] = ((bplpt[num] & 0xffff0000) | (v & 0xfffe)) >>> 0;
		bplptx[num] = ((bplptx[num] & 0xffff0000) | (v & 0xfffe)) >>> 0;
		//BUG.info('%d:%d:BPL%dPTL %08X', hpos, this.vpos, num, bplpt[num]);
	};

	this.BPLxDAT = function (hpos, v, num) {
		if (num == 0 && hpos >= 7) {
			this.decide_line(hpos);
			this.decide_fetch(hpos);
		}
		bplxdat[num] = v;
		if (num == 0 && hpos >= 7) {
			bpl1dat_written = true;
			bpl1dat_written_at_least_once = true;
			if (thisline_decision.plfleft < 0) {
				thisline_decision.plfleft = hpos & ~3;
				this.reset_bpl_vars();
				this.compute_delay_offset();
			}
			this.update_bpldats(hpos);
		}
	};
	
	this.BPLCON0_Denise = function (hpos, v, immediate) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
			v &= ~0x00F1;
		else if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			v &= ~0x00B0;
		v &= ~(0x0200 | 0x0100 | 0x0080 | 0x0020);
		/*#if SPRBORDER
		 v |= 1;
		 #endif*/
		if (bplcon0_d == v)
			return;

		bplcon0_dd = -1;
		if (is_ehb(bplcon0_d, bplcon2))
			v |= 0x80;

		if (immediate)
			this.record_register_change(hpos, 0x100, v);
		else
			this.record_register_change(hpos, 0x100, (bplcon0_d & ~(0x800 | 0x400 | 0x80)) | (v & (0x0800 | 0x400 | 0x80 | 0x01)));

		bplcon0_d = v & ~0x80;

		if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) {
			this.decide_sprites(hpos);
			sprres = expand_sprres(v, bplcon3);
		}
		if (thisline_decision.plfleft < 0)
			this.update_denise(hpos);
	};

	this.BPLCON0 = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
			v &= ~0x00F1;
		else if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			v &= ~0x00B0;
		v &= ~(0x0080 | 0x0020);

		/*#if SPRBORDER
		 v |= 1;
		 #endif*/
		if (bplcon0 == v)
			return;

		if (!this.issyncstopped()) {
			vpos_previous = this.vpos;
			hpos_previous = hpos;
		}

		if ((bplcon0 & 4) != (v & 4))
			this.checklacecount((v & 4) != 0);

		bplcon0 = v;

		this.bpldmainitdelay(hpos);

		if (thisline_decision.plfleft < 0)
			this.BPLCON0_Denise(hpos, v, true);
	};

	this.BPLCON1 = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			v &= 0xff;
		if (bplcon1 == v)
			return;
		ddf_change = this.vpos;
		this.decide_line(hpos);
		this.decide_fetch(hpos);
		bplcon1_hpos = hpos;
		bplcon1 = v;
	};

	this.BPLCON2 = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			v &= 0x7f;
		if (bplcon2 == v)
			return;
		this.decide_line(hpos);
		bplcon2 = v;
		this.record_register_change(hpos, 0x104, v);
	};

	this.BPLCON3 = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
			return;
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA)) {
			v &= 0x003f;
			v |= 0x0c00;
		}
		/*#if SPRBORDER
		 v |= 2;
		 #endif*/
		if (bplcon3 == v)
			return;
		this.decide_line(hpos);
		this.decide_sprites(hpos);
		bplcon3 = v;
		sprres = expand_sprres(bplcon0, bplcon3);
		this.record_register_change(hpos, 0x106, v);
	};

/*#ifdef AGA
	this.BPLCON4 = function(hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			return;
		if (bplcon4 == v)
			return;
		this.decide_line(hpos);
		bplcon4 = v;
		this.record_register_change(hpos, 0x10c, v);
	}
#endif*/

	function castWord(v) { return (v & 0x8000) ? (v - 0x10000) : v; }

	this.BPL1MOD = function (hpos, v) {
		v &= ~1;
		if (bpl1mod == castWord(v))
			return;
		this.decide_line(hpos);
		this.decide_fetch(hpos);
		bpl1mod = castWord(v);
	};

	this.BPL2MOD = function (hpos, v) {
		v &= ~1;
		if (bpl2mod == castWord(v))
			return;
		this.decide_line(hpos);
		this.decide_fetch(hpos);
		bpl2mod = castWord(v);
	};
	
	this.calcdiw = function () {
		var hstrt = diwstrt & 0xFF;
		var hstop = diwstop & 0xFF;
		var vstrt = diwstrt >> 8;
		var vstop = diwstop >> 8;

		// vertical in ECS Agnus
		if (diwhigh_written && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)) {
			vstrt |= (diwhigh & 7) << 8;
			vstop |= ((diwhigh >> 8) & 7) << 8;
		} else {
			if ((vstop & 0x80) == 0)
				vstop |= 0x100;
		}
		// horizontal in ECS Denise
		if (diwhigh_written && (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)) {
			hstrt |= ((diwhigh >> 5) & 1) << 8;
			hstop |= ((diwhigh >> 13) & 1) << 8;
		} else {
			hstop += 0x100;
		}

		diw_hstrt = hstrt;
		diw_hstop = hstop;

		diwfirstword = coord_diw_to_window_x(hstrt);
		diwlastword = coord_diw_to_window_x(hstop);
		if (diwfirstword >= diwlastword) {
			diwfirstword = 0;
			diwlastword = max_diwlastword();
		}
		if (diwfirstword < 0)
			diwfirstword = 0;

		plffirstline = vstrt;
		plflastline = vstop;

		plfstrt = ddfstrt;
		plfstop = ddfstop;
		/* probably not the correct place.. should use plf_state instead */
		if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
			/* ECS/AGA and ddfstop > maxhpos == always-on display */
			if (plfstop > this.maxhpos)
				plfstrt = 0;
			if (plfstrt < HARD_DDF_START)
				plfstrt = HARD_DDF_START;
			plfstrt_start = plfstrt - 4;
		} else {
			/* OCS and ddfstrt >= ddfstop == ddfstop = max */
			if (plfstrt >= plfstop && plfstrt >= HARD_DDF_START)
				plfstop = 0xff;
			plfstrt_start = HARD_DDF_START - 2;
		}
		diw_change = 2;
		//console.log('calcdiw', hstrt,hstop,vstrt,vstop, plfstrt,plfstop);
	};

	this.DIWSTRT = function (hpos, v) {
		if (diwstrt == v && !diwhigh_written)
			return;
		this.decide_diw(hpos);
		this.decide_line(hpos);
		diwhigh_written = false;
		diwstrt = v;
		this.calcdiw();
	};

	this.DIWSTOP = function (hpos, v) {
		if (diwstop == v && !diwhigh_written)
			return;
		this.decide_diw(hpos);
		this.decide_line(hpos);
		diwhigh_written = false;
		diwstop = v;
		this.calcdiw();
	};

	this.DIWHIGH = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & (CSMASK_ECS_DENISE | CSMASK_ECS_AGNUS)))
			return;
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			v &= ~(0x0008 | 0x0010 | 0x1000 | 0x0800);
		v &= ~(0x8000 | 0x4000 | 0x0080 | 0x0040);
		if (diwhigh_written && diwhigh == v)
			return;
		this.decide_line(hpos);
		diwhigh_written = true;
		diwhigh = v;
		this.calcdiw();
	};	

	this.DDFSTRT = function (hpos, v) {
		v &= 0xfe;
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			v &= 0xfc;
		if (ddfstrt == v && hpos + 2 != ddfstrt)
			return;
		ddf_change = this.vpos;
		this.decide_line(hpos);
		ddfstrt_old_hpos = hpos;
		ddfstrt = v;
		this.calcdiw();
		/*if (ddfstop > 0xD4 && (ddfstrt & 4) == 4) {
		 static int last_warned;
		 last_warned = (last_warned + 1) & 4095;
		 if (last_warned == 0) BUG.info('WARNING! Very strange DDF values (%x %x).', ddfstrt, ddfstop);
		 }*/
	};

	this.DDFSTOP = function (hpos, v) {
		v &= 0xfe;
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			v &= 0xfc;
		if (ddfstop == v && hpos + 2 != ddfstop)
			return;
		ddf_change = this.vpos;
		this.decide_line(hpos);
		this.decide_fetch(hpos);
		ddfstop = v;
		this.calcdiw();
		if (fetch_state != FETCH_NOT_STARTED)
			this.estimate_last_fetch_cycle(hpos);
		/*if (ddfstop > 0xD4 && (ddfstrt & 4) == 4) {
		 static int last_warned;
		 if (last_warned == 0) BUG.info('WARNING! Very strange DDF values (%x).', ddfstop);
		 last_warned = (last_warned + 1) & 4095;
		 }*/
	};
	
	this.FMODE = function (hpos, v) {
		if (!(AMIGA.config.chipset.mask & CSMASK_AGA))
			v = 0;
		v &= 0xC00F;
		if (fmode == v)
			return;
		ddf_change = this.vpos;
		fmode = v;
		sprite_width = GET_SPRITEWIDTH(fmode);
		this.bpldmainitdelay(hpos);
	};	
	
	this.checkautoscalecol0 = function () {
		if (!AMIGA.copper.access || this.vpos < 20 || this.isbrdblank(-1, bplcon0, bplcon3))
			return;
		// autoscale if copper changes COLOR00 on top or bottom of screen
		if (this.vpos >= minfirstline) {
			var vpos2 = autoscale_bordercolors ? minfirstline : this.vpos;
			if (first_planes_vpos == 0)
				first_planes_vpos = vpos2 - 2;
			if (plffirstline_total == this.current_maxvpos())
				plffirstline_total = vpos2 - 2;
			if (vpos2 > last_planes_vpos || vpos2 > plflastline_total)
				plflastline_total = last_planes_vpos = vpos2 + 3;
			autoscale_bordercolors = 0;
		} else
			autoscale_bordercolors++;
	};
	
	this.COLOR_WRITE = function (hpos, v, num) {
		//var colzero = false;
		v &= 0xFFF;
		/*#ifdef AGA
		 if (AMIGA.config.chipset.mask & CSMASK_AGA) {
		 int r,g,b;
		 int cr,cg,cb;
		 int colreg;
		 uae_u32 cval;

		 if (bplcon2 & 0x0100)
		 return;

		 colreg = ((bplcon3 >> 13) & 7) * 32 + num;
		 r = (v & 0xF00) >> 8;
		 g = (v & 0xF0) >> 4;
		 b = (v & 0xF) >> 0;
		 cr = current_colors.color_regs_aga[colreg] >> 16;
		 cg = (current_colors.color_regs_aga[colreg] >> 8) & 0xFF;
		 cb = current_colors.color_regs_aga[colreg] & 0xFF;

		 if (bplcon3 & 0x200) {
		 cr &= 0xF0; cr |= r;
		 cg &= 0xF0; cg |= g;
		 cb &= 0xF0; cb |= b;
		 } else {
		 cr = r + (r << 4);
		 cg = g + (g << 4);
		 cb = b + (b << 4);
		 color_regs_aga_genlock[colreg] = v >> 15;
		 }
		 cval = (cr << 16) | (cg << 8) | cb;
		 if (cval && colreg == 0)
		 colzero = true;

		 if (cval == current_colors.color_regs_aga[colreg])
		 return;

		 if (colreg == 0)
		 this.checkautoscalecol0 ();

		 //Call this with the old table still intact.
		 this.record_color_change (hpos, colreg, cval);
		 remembered_color_entry = -1;
		 current_colors.color_regs_aga[colreg] = cval;
		 current_colors.acolors[colreg] = getxcolor (cval);

		 } else {
		 #endif*/
		//if (num && v == 0) colzero = true;

		if (!FAST_COLORS) {
			if (current_colors.color_regs_ecs[num] == v)
				return;
		}
		if (num == 0)
			this.checkautoscalecol0();

		if (!FAST_COLORS) {
			this.record_color_change(hpos, num, v);
			remembered_color_entry = -1;
		}
		current_colors.color_regs_ecs[num] = v;
		current_colors.acolors[num] = getxcolor(v);
		/*#ifdef AGA
		 }
		 #endif*/
	};	

	/*this.islightpentriggered = function() {
		if (beamcon0 & 0x2000) // LPENDIS
			return 0;
		return lightpen_triggered > 0;
	}
	this.GETVPOS = function() {
		return this.islightpentriggered() ? vpos_lpen : (this.issyncstopped() ? vpos_previous : this.vpos);
	}
	this.GETHPOS = function() {
		return this.islightpentriggered() ? hpos_lpen : (this.issyncstopped() ? hpos_previous : this.hpos());
	}*/
	this.issyncstopped = function () {
		return (bplcon0 & 2) != 0 && !AMIGA.config.chipset.genlock;
	};
	this.GETVPOS = function () {
		return this.issyncstopped() ? vpos_previous : this.vpos;
	};
	this.GETHPOS = function () {
		return this.issyncstopped() ? hpos_previous : this.hpos();
	};

	const HPOS_OFFSET = 3; //(currprefs.cpu_model < 68020 ? 3 : 0)
	
	this.VPOSR = function () {
		var vp = this.GETVPOS();
		var hp = this.GETHPOS();
		//var vp = this.vpos;
		//var hp = this.hpos();
		var csbit = 0;

		if (hp + HPOS_OFFSET >= this.maxhpos) {
			vp++;
			if (vp >= this.maxvpos + this.lof_store)
				vp = 0;
		}
		vp = (vp >> 8) & 7;

		if (AMIGA.config.chipset.agnus_rev >= 0)
			csbit |= AMIGA.config.chipset.agnus_rev << 8;
		else {
			/*#ifdef AGA
			 csbit |= (AMIGA.config.chipset.mask & CSMASK_AGA) ? 0x2300 : 0;
			 #endif*/
			csbit |= (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) ? 0x2000 : 0;
			if (AMIGA.mem.chip.size > 1024 * 1024 && (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
				csbit |= 0x2100;
			if (AMIGA.config.video.ntsc)
				csbit |= 0x1000;
		}

		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			vp &= 1;
		vp = vp | (this.lof_store ? 0x8000 : 0) | csbit;
		if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)
			vp |= this.lol ? 0x80 : 0;

		//BUG.info('VPOSR $%x', vp);
		return vp;
	};

	this.VPOSW = function (v) {
		if (this.lof_store != ((v & 0x8000) ? 1 : 0)) {
			this.lof_store = (v & 0x8000) ? 1 : 0;
			this.lof_changing = this.lof_store ? 1 : -1;
		}
		if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
			this.lol = (v & 0x0080) ? 1 : 0;
			if (!this.is_linetoggle())
				this.lol = 0;
		}
		if (this.lof_changing)
			return;

		v &= 7;
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			v &= 1;

		this.vpos &= 0x00ff;
		this.vpos |= v << 8;
		//BUG.info('VPOSW $%x', this.vpos);
	};

	this.VHPOSW = function (v) {
		this.vpos &= 0xff00;
		this.vpos |= v >> 8;
		//BUG.info('VHPOSW %x %d', v, this.vpos);
	};

	this.VHPOSR = function () {
		var vp = this.GETVPOS();
		var hp = this.GETHPOS();
		//var vp = this.vpos;
		//var hp = this.hpos();

		hp += HPOS_OFFSET;
		if (hp >= this.maxhpos) {
			hp -= this.maxhpos;
			vp++;
			if (vp >= this.maxvpos + this.lof_store)
				vp = 0;
		}
		if (HPOS_OFFSET) {
			hp += 1;
			if (hp >= this.maxhpos)
				hp -= this.maxhpos;
		}
		vp &= 0xff;
		hp &= 0xff;

		vp <<= 8;
		vp |= hp;

		//BUG.info('VHPOSR $%x', vp);
		return vp;
	};	
	
	this.BEAMCON0 = function (v) {
		if (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS) {
			if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE))
				v &= 0x20;

			if (v != new_beamcon0) {
				new_beamcon0 = v;
				if (v & ~0x20)
					BUG.info('BEAMCON0() $%04x written.', v);
			}
		}
	};

	this.DENISEID = function () {
		if (AMIGA.config.chipset.denise_rev >= 0)
			return [0, AMIGA.config.chipset.denise_rev];
		/*#ifdef AGA
		 if (AMIGA.config.chipset.mask & CSMASK_AGA) {
		 if (currprefs.cs_ide == IDE_A4000) return [0, 0xFCF8];
		 return [0, 0x00F8];
		 }
		 #endif*/
		if (AMIGA.config.chipset.mask & CSMASK_ECS_DENISE)
			return [0, 0xFFFC];

		if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible)
			return [1, 0xFFFF];
		return [0, 0xFFFF];
	};	
	
	/*---------------------------------*/

	this.is_bitplane_dma = function (hpos) {
		if (hpos < plfstrt)
			return 0;
		if ((plf_state == PLF_END && hpos >= thisline_decision.plfright) || hpos >= estimated_last_fetch_cycle)
			return 0;

		return curr_diagram[(hpos - cycle_diagram_shift) & fetchstart_mask];
	};
	
	this.update_denise = function (hpos) {
		toscr_res = GET_RES_DENISE(bplcon0_d);
		if (bplcon0_dd != bplcon0_d) {
			this.record_color_change2(hpos, 0x100 + 0x1000, bplcon0_d);
			bplcon0_dd = bplcon0_d;
		}
		toscr_nr_planes = GET_PLANES(bplcon0_d);

		if (!(AMIGA.config.chipset.mask & CSMASK_AGA) && bplcon0_res == 0 && bplcon0_planes == 7) { //OCS 7 planes			
			if (toscr_nr_planes2 < 6)
				toscr_nr_planes2 = 6;
		} else
			toscr_nr_planes2 = toscr_nr_planes;
	};	
	
	this.setup_fmodes = function (hpos) {
		switch (fmode & 3) {
			case 0:
				fetchmode = 0;
				break;
			case 1:
			case 2:
				fetchmode = 1;
				break;
			case 3:
				fetchmode = 2;
				break;
		}
		badmode = GET_RES_AGNUS(bplcon0) != GET_RES_DENISE(bplcon0);
		bplcon0_res = GET_RES_AGNUS(bplcon0);
		bplcon0_planes = GET_PLANES(bplcon0);
		bplcon0_planes_limit = GET_PLANES_LIMIT(bplcon0);
		fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];
		fetchunit_mask = fetchunit - 1;
		fetchstart_shift = fetchstarts[fetchmode * 4 + bplcon0_res];
		fetchstart = 1 << fetchstart_shift;
		fetchstart_mask = fetchstart - 1;
		fm_maxplane_shift = fm_maxplanes[fetchmode * 4 + bplcon0_res];
		fm_maxplane = 1 << fm_maxplane_shift;
		fetch_modulo_cycle = fetchunit - fetchstart;
		curr_diagram = cycle_diagram_table[fetchmode][bplcon0_res][bplcon0_planes_limit];
		this.estimate_last_fetch_cycle(hpos);
		bpldmasetuphpos = -1;
		bpldmasetupphase = 0;
		ddf_change = this.vpos;
	};	

	this.maybe_setup_fmodes = function (hpos) {
		switch (bpldmasetupphase) {
			case 0:
				this.BPLCON0_Denise(hpos, bplcon0, false);
				bpldmasetupphase++;
				bpldmasetuphpos += (4 + (bplcon0_planes == 8 ? 1 : 0)) - BPLCON_DENISE_DELAY;
				break;
			case 1:
				this.setup_fmodes(hpos);
				break;
		}
	};

	this.maybe_check = function (hpos) {
		if (bpldmasetuphpos > 0 && hpos >= bpldmasetuphpos)
			this.maybe_setup_fmodes(hpos);
	};	

	this.compute_delay_offset = function () {
		delayoffset = (16 << fetchmode) - (((plfstrt - HARD_DDF_START) & fetchstart_mask) << 1);
	};	
	
	this.compute_toscr_delay_1 = function (con1) {
		var delay1 = (con1 & 0x0f) | ((con1 & 0x0c00) >> 6);
		var delay2 = ((con1 >> 4) & 0x0f) | (((con1 >> 4) & 0x0c00) >> 6);
		var shdelay1 = (con1 >> 12) & 3;
		var shdelay2 = (con1 >> 8) & 3;
		var delaymask;
		var fetchwidth = 16 << fetchmode;

		delay1 += delayoffset;
		delay2 += delayoffset;
		delaymask = (fetchwidth - 1) >> toscr_res;
		toscr_delay1 = (delay1 & delaymask) << toscr_res;
		toscr_delay1 |= shdelay1 >> (RES_MAX - toscr_res);
		toscr_delay2 = (delay2 & delaymask) << toscr_res;
		toscr_delay2 |= shdelay2 >> (RES_MAX - toscr_res);
	};

	this.compute_toscr_delay = function (hpos, con1) {
		this.update_denise(hpos);
		this.compute_toscr_delay_1(con1);
	};

	this.update_toscr_planes = function () {
		if (toscr_nr_planes2 > thisline_decision.nr_planes) {
			for (var j = thisline_decision.nr_planes; j < toscr_nr_planes2; j++) {
				if (!thisline_changed) {
					for (var i = 0; i < out_offs; i++) {
						if (line_data[next_lineno][j][i]) {
							thisline_changed = 1;
							break;
						}
					}
				}
				for (var i = 0; i < out_offs; i++) line_data[next_lineno][j][i] = 0; //memset(ptr, 0, out_offs * 4);
			}
			thisline_decision.nr_planes = toscr_nr_planes2;
		}
	};

	this.maybe_first_bpl1dat = function (hpos) {
		if (thisline_decision.plfleft >= 0) {
			if (plfleft_real < 0) {
				for (var i = 0; i < MAX_PLANES; i++) {
					todisplay[i][0] = 0;
					/*#ifdef AGA
					 todisplay[i][1] = 0;
					 todisplay[i][2] = 0;
					 todisplay[i][3] = 0;
					 #endif*/
				}
				plfleft_real = hpos;
				bpl1dat_early = true;
			}
		} else {
			plfleft_real = thisline_decision.plfleft = hpos;
			this.compute_delay_offset();
		}
	}; 
	 
 	this.checklacecount = function (lace) {
		if (lace === null)
			lace = (bplcon0 & 4) != 0;

		if (!interlace_changed) {
			if (nlace_cnt >= NLACE_CNT_NEEDED && lace) {
				lof_togglecnt_lace = LOF_TOGGLES_NEEDED;
				lof_togglecnt_nlace = 0;
				//BUG.info('immediate lace');
				nlace_cnt = 0;
			} else if (nlace_cnt <= -NLACE_CNT_NEEDED && !lace) {
				lof_togglecnt_nlace = LOF_TOGGLES_NEEDED;
				lof_togglecnt_lace = 0;
				//BUG.info('immediate nlace');
				nlace_cnt = 0;
			}
		}
		if (lace) {
			if (nlace_cnt > 0)
				nlace_cnt = 0;
			nlace_cnt--;
			if (nlace_cnt < -NLACE_CNT_NEEDED * 2)
				nlace_cnt = -NLACE_CNT_NEEDED * 2;
		} else if (!lace) {
			if (nlace_cnt < 0)
				nlace_cnt = 0;
			nlace_cnt++;
			if (nlace_cnt > NLACE_CNT_NEEDED * 2)
				nlace_cnt = NLACE_CNT_NEEDED * 2;
		}
	};
	
	var dumpcnt = 100;
	this.dumpsync = function () {
		if (dumpcnt < 0)
			return;
		dumpcnt--;
		BUG.info('BEAMCON0=%04X VTOTAL=%04X  HTOTAL=%04X', new_beamcon0, this.vtotal, this.htotal);
		BUG.info('  HSSTOP=%04X HBSTRT=%04X  HBSTOP=%04X', this.hsstop, this.hbstrt, this.hbstop);
		BUG.info('  VSSTOP=%04X VBSTRT=%04X  VBSTOP=%04X', this.vsstop, this.vbstrt, this.vbstop);
		BUG.info('  HSSTRT=%04X VSSTRT=%04X HCENTER=%04X', this.hsstrt, this.vsstrt, this.hcenter);
	};
	
	this.varsync = function () {
		//console.log('varsync()');
		if (!CUSTOM_SIMPLE) {
			if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
				return;
			if (!(beamcon0 & 0x80))
				return;
			this.vpos_count = 0;
			//this.dumpsync();
		}
	};
	
	this.count_frame = function () {
		if (++framecnt >= AMIGA.config.video.framerate)
			framecnt = 0;
	};	
	
	this.vsync_handle_redraw = function () { //(long_frame, lof_changed, bplcon0p, bplcon3p)
		last_redraw_point++;
		if (this.lof_changed || this.lof_store || interlace_seen <= 0 || doublescan < 0 || last_redraw_point >= 2) {
			last_redraw_point = 0;

			if (framecnt == 0)
				this.finish_drawing_frame();
			/*#if 0
			 if (interlace_seen > 0)
			 interlace_seen = -1;
			 else if (interlace_seen == -1) {
			 interlace_seen = 0;
			 if (currprefs.scandoubler && currprefs.vresolution)
			 notice_screen_contents_lost ();
			 }
			 #endif*/
			this.count_frame();

			if (framecnt == 0)
				this.init_drawing_frame();
		}
	};
	
	this.init_hardware_frame = function () {
		first_bpl_vpos = -1;
		next_lineno = 0;
		prev_lineno = -1;
		nextline_how = NLN_NORMAL;
		diwstate = DIW_WAITING_START;
		ddfstate = DIW_WAITING_START;
		first_planes_vpos = 0;
		last_planes_vpos = 0;
		diwfirstword_total = max_diwlastword();
		diwlastword_total = 0;
		ddffirstword_total = max_diwlastword();
		ddflastword_total = 0;
		plflastline_total = 0;
		plffirstline_total = this.current_maxvpos();
		autoscale_bordercolors = 0;
		for (var i = 0; i < MAX_SPRITES; i++)
			spr[i].ptxhpos = MAXHPOS;
	};

	this.init_hardware_for_drawing_frame = function () {
		if (prev_sprite_entries) {
			var first_pixel = prev_sprite_entries[0].first_pixel;
			var npixels = prev_sprite_entries[prev_next_sprite_entry].first_pixel - first_pixel;
			for (var i = 0; i < npixels; i++) spixels[first_pixel + i] = 0; //memset (spixels + first_pixel, 0, npixels * sizeof *spixels);
			for (var i = 0; i < npixels; i++) spixstate[first_pixel + i] = 0; //memset (spixstate.bytes + first_pixel, 0, npixels * sizeof *spixstate.bytes);
		}
		prev_next_sprite_entry = next_sprite_entry;

		next_color_change = 0;
		next_sprite_entry = 0;
		next_color_entry = 0;
		remembered_color_entry = -1;

		prev_sprite_entries = sprite_entries[current_change_set];
		curr_sprite_entries = sprite_entries[current_change_set ^ 1];
		prev_color_changes = color_changes[current_change_set];
		curr_color_changes = color_changes[current_change_set ^ 1];
		prev_color_tables = color_tables[current_change_set];
		curr_color_tables = color_tables[current_change_set ^ 1];

		prev_drawinfo = line_drawinfo[current_change_set];
		curr_drawinfo = line_drawinfo[current_change_set ^ 1];
		current_change_set ^= 1;

		color_src_match = color_dest_match = -1;

		curr_sprite_entries[0].first_pixel = current_change_set * MAX_SPR_PIXELS;
		next_sprite_forced = 1;
	};

	this.reset_decisions = function () {
		if (this.nodraw())
			return;

		plfleft_real = -1;
		toscr_nr_planes = toscr_nr_planes2 = 0;

		bpl1dat_written = false;
		bpl1dat_written_at_least_once = false;
		bpl1dat_early = false;

		thisline_decision.bplres = bplcon0_res;
		thisline_decision.nr_planes = 0;
		thisline_decision.plfleft = -1;
		thisline_decision.plflinelen = -1;
		thisline_decision.ham_seen = !!(bplcon0 & 0x800);
		thisline_decision.ehb_seen = !!is_ehb(bplcon0, bplcon2);
		thisline_decision.ham_at_start = !!(bplcon0 & 0x800);

		thisline_changed = 0;
		thisline_decision.diwfirstword = -1;
		thisline_decision.diwlastword = -1;
		if (hdiwstate == DIW_WAITING_STOP) {
			thisline_decision.diwfirstword = 0;
			if (SMART_UPDATE) {
				if (thisline_decision.diwfirstword != line_decisions[next_lineno].diwfirstword)
					thisline_changed = 1; //MARK_LINE_CHANGED;
			}
		}
		thisline_decision.ctable = -1;

		curr_drawinfo[next_lineno].first_color_change = next_color_change;
		curr_drawinfo[next_lineno].first_sprite_entry = next_sprite_entry;

		next_sprite_forced = 1;
		last_sprite_point = 0;
		fetch_state = FETCH_NOT_STARTED;
		bplcon1_hpos = -1;
		if (bpldmasetuphpos >= 0) {
			this.BPLCON0_Denise(0, bplcon0, true);
			this.setup_fmodes(0);
		}
		bpldmasetuphpos = -1;
		bpldmasetupphase = 0;
		ddfstrt_old_hpos = -1;

		if (plf_state > PLF_ACTIVE || (plf_state == PLF_ACTIVE && !(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS)))
			plf_state = PLF_IDLE;

		/*memset (todisplay, 0, sizeof todisplay);
		 memset (fetched, 0, sizeof fetched);
		 memset (fetched_aga0, 0, sizeof fetched_aga0);
		 memset (fetched_aga1, 0, sizeof fetched_aga1);
		 memset (outword, 0, sizeof outword);*/
		for (var i = 0; i < MAX_PLANES; i++) {
			for (var j = 0; j < 4; j++)
				todisplay[i][j] = 0;

			fetched[i] = 0;
			/*#ifdef AGA
			 if (AMIGA.config.chipset.mask & CSMASK_AGA) {
			 fetched_aga0[i] = 0;
			 fetched_aga1[i] = 0;
			 }
			 #endif*/
			outword[i] = 0;
		}

		last_decide_line_hpos = -1;
		last_ddf_pix_hpos = -1;
		last_sprite_hpos = -1;
		last_fetch_hpos = -1;

		thisline_decision.bplcon0 = bplcon0;
		thisline_decision.bplcon2 = bplcon2;
		thisline_decision.bplcon3 = bplcon3;
		/*#ifdef AGA
		 thisline_decision.bplcon4 = bplcon4;
		 #endif*/
	};

	this.record_diw_line = function (plfstrt, first, last) {
		if (last > max_diwstop)
			max_diwstop = last;
		if (first < min_diwstart) {
			min_diwstart = first;
			/*
			 if (plfstrt * 2 > min_diwstart)
			 min_diwstart = plfstrt * 2;
			 */
		}
	};

	this.sprites_differ = function (dip, dip_old) {
		var this_first = curr_sprite_entries[dip.first_sprite_entry];
		var this_last = curr_sprite_entries[dip.last_sprite_entry];
		var prev_first = prev_sprite_entries[dip_old.first_sprite_entry];

		if (dip.nr_sprites != dip_old.nr_sprites)
			return 1;

		if (dip.nr_sprites == 0)
			return 0;

		/*for (var i = 0; i < dip.nr_sprites; i++) { //FIXME
		 if (this_first[i].pos != prev_first[i].pos
		 || this_first[i].max != prev_first[i].max
		 || this_first[i].has_attached != prev_first[i].has_attached)
		 return 1;
		 }*/
		if (this_first.pos != prev_first.pos || this_first.max != prev_first.max || this_first.has_attached != prev_first.has_attached) //FIX
			return 1;

		var npixels = this_last.first_pixel + (this_last.max - this_last.pos) - this_first.first_pixel;

		//if (memcmp (spixels + this_first.first_pixel, spixels + prev_first.first_pixel, npixels * sizeof (uae_u16)) != 0) return 1;
		for (i = 0; i < npixels; i++) {
			if (spixels[this_first.first_pixel + i] != spixels[prev_first.first_pixel + i])
				return 1;
		}
		//if (memcmp (spixstate.bytes + this_first.first_pixel, spixstate.bytes + prev_first.first_pixel, npixels) != 0) return 1;
		for (i = 0; i < npixels; i++) {
			if (spixstate[this_first.first_pixel + i] != spixstate[prev_first.first_pixel + i])
				return 1;
		}
		return 0;
	};

	this.color_changes_differ = function (dip, dip_old) {
		if (dip.nr_color_changes != dip_old.nr_color_changes)
			return 1;
		if (dip.nr_color_changes == 0)
			return 0;
		//if (memcmp(curr_color_changes + dip.first_color_change, prev_color_changes + dip_old.first_color_change, dip.nr_color_changes * sizeof *curr_color_changes) != 0)
		for (i = 0; i < dip.nr_color_changes; i++) {
			if (curr_color_changes[dip.first_color_change + i].cmp(prev_color_changes[dip_old.first_color_change + i]) != 0)
				return 1;
		}
		return 0;
	};	

	this.finish_decisions = function () {
		var hpos = this.maxhpos;

		if (this.nodraw())
			return;

		this.decide_diw(hpos);
		this.decide_line(hpos);
		this.decide_fetch(hpos);

		this.record_color_change2(hsyncstartpos, 0xffff, 0);
		if (thisline_decision.plfleft >= 0 && thisline_decision.plflinelen < 0) {
			if (fetch_state != FETCH_NOT_STARTED) {
				BUG.info('finish_decisions() fetch_state=%d plfleft=%d,len=%d,vpos=%d,hpos=%d', fetch_state, thisline_decision.plfleft, thisline_decision.plflinelen, this.vpos, hpos);
				Fatal(333, 'finish_decisions() fetch_state != FETCH_NOT_STARTED');
			}
			thisline_decision.plfright = thisline_decision.plfleft;
			thisline_decision.plflinelen = 0;
			thisline_decision.bplres = RES_LORES;
		}
		if (hdiwstate == DIW_WAITING_STOP) {
			thisline_decision.diwlastword = max_diwlastword();
			if (thisline_decision.diwfirstword < 0)
				thisline_decision.diwfirstword = 0;
		}
		if (SMART_UPDATE) {
			if (thisline_decision.diwfirstword != line_decisions[next_lineno].diwfirstword)
				thisline_changed = 1; //MARK_LINE_CHANGED;
			if (thisline_decision.diwlastword != line_decisions[next_lineno].diwlastword)
				thisline_changed = 1; //MARK_LINE_CHANGED;
		}
		var dip = curr_drawinfo[next_lineno];
		var dip_old = prev_drawinfo[next_lineno];
		var dp = line_decisions[next_lineno];
		var changed = thisline_changed;
		if (thisline_decision.plfleft >= 0 && thisline_decision.nr_planes > 0)
			this.record_diw_line(thisline_decision.plfleft, diwfirstword, diwlastword);

		this.decide_sprites(hpos + 1);

		dip.last_sprite_entry = next_sprite_entry;
		dip.last_color_change = next_color_change;

		if (thisline_decision.ctable < 0)
			this.remember_ctable();

		dip.nr_color_changes = next_color_change - dip.first_color_change;
		dip.nr_sprites = next_sprite_entry - dip.first_sprite_entry;

		if (thisline_decision.plfleft != line_decisions[next_lineno].plfleft)
			changed = 1;
		if (!changed && this.color_changes_differ(dip, dip_old))
			changed = 1;
		if (!changed && /* bitplane visible in this line OR border sprites enabled */
			(thisline_decision.plfleft >= 0 || ((thisline_decision.bplcon0 & 1) && (thisline_decision.bplcon3 & 0x02) && !(thisline_decision.bplcon3 & 0x20)))
			&& this.sprites_differ(dip, dip_old))
			changed = 1;

		if (changed) {
			thisline_changed = 1;
			dp.set(thisline_decision); //*dp = thisline_decision;
		} else
			line_decisions[next_lineno].ctable = thisline_decision.ctable;

		next_color_change += ((HBLANK_OFFSET + 1) >> 1);

		diw_hcounter += this.maxhpos * 2;
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && this.vpos == this.get_equ_vblank_endline() - 1)
			diw_hcounter++;
		if ((AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) || this.vpos > this.get_equ_vblank_endline() || (AMIGA.config.chipset.agnus_dip && this.vpos == 0)) {
			diw_hcounter = this.maxhpos * 2;
			last_hdiw = 1; //2 - 1;
		}
		if (next_color_change >= MAX_REG_CHANGE - 30) {
			BUG.info('ColorChange buffer overflow!');
			next_color_change = 0;
			dip.nr_color_changes = 0;
			dip.first_color_change = 0;
			dip.last_color_change = 0;
		}
	};

	this.hsync_record_line_state = function (lineno, how, changed) {
		if (framecnt != 0)
			return;

		//changed += ((frame_redraw_necessary ? 1 : 0) + ((lineno >= lightpen_y1 && lineno <= lightpen_y2) ? 1 : 0));
		changed += (frame_redraw_necessary ? 1 : 0);

		switch (how) {
			case NLN_NORMAL:
				linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
				break;
			case NLN_DOUBLED:
				linestate[lineno] = changed ? LINE_DECIDED_DOUBLE : LINE_DONE;
				changed += (linestate[lineno + 1] != LINE_REMEMBERED_AS_PREVIOUS ? 1 : 0);
				linestate[lineno + 1] = changed ? LINE_AS_PREVIOUS : LINE_DONE_AS_PREVIOUS;
				break;
			case NLN_NBLACK:
				linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
				if (linestate[lineno + 1] != LINE_REMEMBERED_AS_BLACK)
					linestate[lineno + 1] = LINE_BLACK;
				break;
			case NLN_LOWER:
				if (linestate[lineno - 1] == LINE_UNDECIDED)
					linestate[lineno - 1] = LINE_DECIDED; //LINE_BLACK;
				linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
				break;
			case NLN_UPPER:
				linestate[lineno] = changed ? LINE_DECIDED : LINE_DONE;
				if (linestate[lineno + 1] == LINE_UNDECIDED
					|| linestate[lineno + 1] == LINE_REMEMBERED_AS_PREVIOUS
					|| linestate[lineno + 1] == LINE_AS_PREVIOUS)
					linestate[lineno + 1] = LINE_DECIDED; //LINE_BLACK;
				break;
		}
	};	
	
	this.get_equ_vblank_endline = function () {
		return equ_vblank_endline + (equ_vblank_toggle ? (this.lof_current ? 1 : 0) : 0);
	};

	this.decide_diw = function (hpos) {
		var hdiw = hpos >= this.maxhpos ? this.maxhpos * 2 + 1 : hpos * 2 + 2;
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_DENISE) && this.vpos <= this.get_equ_vblank_endline())
			hdiw = diw_hcounter;

		hdiw &= 511;
		for (; ;) {
			var lhdiw = hdiw;
			if (last_hdiw > lhdiw)
				lhdiw = 512;

			if (lhdiw >= diw_hstrt && last_hdiw < diw_hstrt && hdiwstate == DIW_WAITING_START) {
				if (thisline_decision.diwfirstword < 0)
					thisline_decision.diwfirstword = diwfirstword < 0 ? 0 : diwfirstword;
				hdiwstate = DIW_WAITING_STOP;
			}
			if (lhdiw >= diw_hstop && last_hdiw < diw_hstop && hdiwstate == DIW_WAITING_STOP) {
				if (thisline_decision.diwlastword < 0)
					thisline_decision.diwlastword = diwlastword < 0 ? 0 : diwlastword;
				hdiwstate = DIW_WAITING_START;
			}
			if (lhdiw != 512)
				break;
			last_hdiw = -1; //0 - 1;
		}
		last_hdiw = hdiw;
	};
	
	this.reset_bpl_vars = function (hpos) {
		out_nbits = 0;
		out_offs = 0;
		toscr_nbits = 0;
		thisline_decision.bplres = bplcon0_res;
	};

	this.start_bpl_dma = function (hpos, hstart) {
		if (first_bpl_vpos < 0)
			first_bpl_vpos = this.vpos;

		if (this.doflickerfix() && interlace_seen > 0) { //&& !scandoubled_line) {
			for (var i = 0; i < 8; i++) {
				prevbpl[this.lof_current][this.vpos][i] = bplptx[i];
				if (!this.lof_current && (bplcon0 & 4))
					bplpt[i] = prevbpl[1 - this.lof_current][this.vpos][i];
				if (!(bplcon0 & 4) || interlace_seen < 0)
					prevbpl[1 - this.lof_current][this.vpos][i] = prevbpl[this.lof_current][this.vpos][i] = 0;
			}
		}
		plfstrt_sprite = plfstrt;
		fetch_state = FETCH_STARTED;
		fetch_cycle = 0;

		ddfstate = DIW_WAITING_STOP;
		this.compute_toscr_delay(last_fetch_hpos, bplcon1);

		if (bpl1dat_written_at_least_once && hstart > last_fetch_hpos) {
			this.update_fetch_x(hstart, fetchmode);
			bpl1dat_written_at_least_once = false;
		} else
			this.reset_bpl_vars();
		/*#if 0
		 if (!this.nodraw ()) {
		 if (thisline_decision.plfleft >= 0) {
		 out_nbits = (plfstrt - thisline_decision.plfleft) << (1 + toscr_res);
		 out_offs = out_nbits >> 5;
		 out_nbits &= 31;
		 }
		 this.update_toscr_planes();
		 }
		 #endif*/
		last_fetch_hpos = hstart;
		cycle_diagram_shift = hstart;
	};

	this.maybe_start_bpl_dma = function (hpos) {
		//console.log('maybe_start_bpl_dma', hpos);
		if (!(AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))
			return;
		if (fetch_state != FETCH_NOT_STARTED)
			return;
		if (diwstate != DIW_WAITING_STOP)
			return;
		if (hpos <= plfstrt)
			return;
		if (hpos > plfstop - fetchunit)
			return;
		if (ddfstate != DIW_WAITING_START)
			plf_state = PLF_PASSED_STOP;

		this.start_bpl_dma(hpos, hpos);
	};

	this.decide_line = function (hpos) {
		if (this.vpos == plffirstline) {
			diwstate = DIW_WAITING_STOP;
			ddf_change = this.vpos;
		}
		if (this.vpos == plflastline) {
			diwstate = DIW_WAITING_START;
			ddf_change = this.vpos;
		}
		if (hpos <= last_decide_line_hpos)
			return;

		if (fetch_state == FETCH_NOT_STARTED && (diwstate == DIW_WAITING_STOP || (AMIGA.config.chipset.mask & CSMASK_ECS_AGNUS))) {
			var ok = 0;
			if (last_decide_line_hpos < plfstrt_start && hpos >= plfstrt_start) {
				if (plf_state == PLF_IDLE)
					plf_state = PLF_START;
			}
			if (last_decide_line_hpos < plfstrt && hpos >= plfstrt) {
				if (plf_state == PLF_START)
					plf_state = PLF_ACTIVE;
				if (plf_state == PLF_ACTIVE)
					ok = 1;
				if (hpos - 2 == ddfstrt_old_hpos)
					ok = 0;
			}
			if (ok && diwstate == DIW_WAITING_STOP) {
				if (AMIGA.dmaen(DMAF_BPLEN)) {
					this.start_bpl_dma(hpos, plfstrt);
					this.estimate_last_fetch_cycle(plfstrt);
				}
				//last_decide_line_hpos = hpos;
				if (!CUSTOM_SIMPLE)
					this.do_sprites(hpos);

				return;
			}
		}
		if (!CUSTOM_SIMPLE) {
			if (hpos > last_sprite_hpos && last_sprite_hpos < SPR0_HPOS + 4 * MAX_SPRITES)
				this.do_sprites(hpos);
		}
		last_decide_line_hpos = hpos;
	};
	
	/*---------------------------------*/   
	/* to screen */
	
	this.toscr_2_ecs = function (nbits) {
		var mask = 0xffff >> (16 - nbits);
		var i;

		for (i = 0; i < toscr_nr_planes2; i += 2) {
			outword[i] <<= nbits;
			outword[i] |= (todisplay[i][0] >> (16 - nbits + toscr_delay1)) & mask;
			todisplay[i][0] <<= nbits;
		}
		for (i = 1; i < toscr_nr_planes2; i += 2) {
			outword[i] <<= nbits;
			outword[i] |= (todisplay[i][0] >> (16 - nbits + toscr_delay2)) & mask;
			todisplay[i][0] <<= nbits;
		}
	};	

	this.toscr_1 = function (nbits, fm) {
		switch (fm) {
			case 0:
				this.toscr_2_ecs(nbits);
				break;
			/*#ifdef AGA
			 case 1:
			 this.toscr_3_aga(nbits, 1);
			 break;
			 case 2:
			 this.toscr_3_aga(nbits, 2);
			 break;
			 #endif*/
		}
		out_nbits += nbits;
		if (out_nbits == 32) {
			for (var i = 0; i < thisline_decision.nr_planes; i++) {
				if (line_data[next_lineno][i][out_offs] != outword[i]) {
					thisline_changed = 1;
					line_data[next_lineno][i][out_offs] = outword[i];
				}
				outword[i] = 0;
			}
			out_offs++;
			out_nbits = 0;
		}
	};

	this.toscr = function (nbits, fm) {
		if (nbits > 16) {
			this.toscr(16, fm);
			nbits -= 16;
		}
		var t = 32 - out_nbits;
		if (t < nbits) {
			this.toscr_1(t, fm);
			nbits -= t;
		}
		this.toscr_1(nbits, fm);
	};

	this.flush_plane_data = function (fm) {
		var i = 0;

		if (out_nbits <= 16) {
			i += 16;
			this.toscr_1(16, fm);
		}
		if (out_nbits != 0) {
			i += 32 - out_nbits;
			this.toscr_1(32 - out_nbits, fm);
		}
		i += 32;

		this.toscr_1(16, fm);
		this.toscr_1(16, fm);

		if (fm == 2) {
			// flush AGA full 64-bit shift register
			i += 32;
			this.toscr_1(16, fm);
			this.toscr_1(16, fm);
		}
		if (bpl1dat_early) {
			this.toscr_1(16, fm);
			this.toscr_1(16, fm);
		}
		return i >> (1 + toscr_res);
	};
	
	this.flush_display = function (fm) {
		if (toscr_nbits > 0 && thisline_decision.plfleft >= 0)
			this.toscr(toscr_nbits, fm);
		toscr_nbits = 0;
	};
	
	this.beginning_of_plane_block = function (hpos, fm) {
		var oleft = thisline_decision.plfleft;

		this.flush_display(fm);

		if (fm == 0)
			for (var i = 0; i < MAX_PLANES; i++) {
				todisplay[i][0] |= fetched[i];
			}
		/*#ifdef AGA
		 else
		 for (i = 0; i < MAX_PLANES; i++) {
		 if (fm == 2)
		 todisplay[i][1] = fetched_aga1[i];
		 todisplay[i][0] = fetched_aga0[i];
		 }
		 #endif*/

		this.update_denise(hpos);
		this.maybe_first_bpl1dat(hpos);

		bplcon1t2 = bplcon1t;
		bplcon1t = bplcon1;
		if (bplcon1_hpos != hpos || oleft < 0)
			bplcon1t2 = bplcon1t;

		this.compute_toscr_delay(hpos, bplcon1t2);
	};	

	this.update_bpldats = function (hpos) {
		for (var i = 0; i < MAX_PLANES; i++) {
			/*#ifdef AGA
			 fetched_aga0[i] = bplxdat[i];
			 fetched_aga1[i] = 0;
			 #endif*/
			fetched[i] = bplxdat[i];
		}
		this.beginning_of_plane_block(hpos, fetchmode);
	};	
	
	/*---------------------------------*/   
	/* fetch */
	
	this.finish_final_fetch = function (pos, fm) {
		if (thisline_decision.plfleft < 0 || plf_state == PLF_END)
			return;

		plf_state = PLF_END;
		ddfstate = DIW_WAITING_START;
		pos += this.flush_plane_data(fm);
		thisline_decision.plfright = pos;
		thisline_decision.plflinelen = out_offs;

		if (this.vpos >= minfirstline && (thisframe_first_drawn_line < 0 || this.vpos < thisframe_first_drawn_line))
			thisframe_first_drawn_line = this.vpos;
		thisframe_last_drawn_line = this.vpos;

		if (SMART_UPDATE) {
			if (line_decisions[next_lineno].plflinelen != thisline_decision.plflinelen
				|| line_decisions[next_lineno].plfleft != thisline_decision.plfleft
				|| line_decisions[next_lineno].bplcon0 != thisline_decision.bplcon0
				|| line_decisions[next_lineno].bplcon2 != thisline_decision.bplcon2
				|| line_decisions[next_lineno].bplcon3 != thisline_decision.bplcon3
			/*#ifdef AGA
			 || line_decisions[next_lineno].bplcon4 != thisline_decision.bplcon4
			 #endif*/
				) thisline_changed = 1;
		} else
			thisline_changed = 1;
	};

	this.long_fetch_ecs = function (plane, nwords, weird_number_of_bits, dma) {
		//uae_u16 *real_pt = (uae_u16 *)pfield_xlateptr (bplpt[plane], nwords * 2);
		var real_pt = bplpt[plane];
		var delay = (plane & 1) ? toscr_delay2 : toscr_delay1;
		var tmp_nbits = out_nbits;
		var shiftbuffer = todisplay[plane][0];
		var outval = outword[plane];
		var fetchval = fetched[plane];
		//var *dataptr = (uae_u32 *)(line_data[next_lineno] + 2 * plane * MAX_WORDS_PER_LINE + 4 * out_offs);
		var dataptr = out_offs;

		if (dma) {
			bplpt[plane] += nwords * 2;
			bplptx[plane] += nwords * 2;
		}

		//if (real_pt == 0) /* @@@ Don't do this, fall back on chipmem_wget instead.  */
		//return;

		while (nwords > 0) {
			var bits_left = 32 - tmp_nbits;
			var t;

			shiftbuffer |= fetchval;

			t = (shiftbuffer >>> delay) & 0xFFFF;

			if (weird_number_of_bits && bits_left < 16) {
				//outval <<= bits_left;
				//outval |= t >>> (16 - bits_left);
				outval = ((outval << bits_left) | (t >>> (16 - bits_left))) >>> 0;
				//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
				thisline_changed |= line_data[next_lineno][plane][dataptr] ^ outval;
				line_data[next_lineno][plane][dataptr++] = outval;
				outval = t;
				tmp_nbits = 16 - bits_left;
				//shiftbuffer <<= 16;
				shiftbuffer = (shiftbuffer << 16) >>> 0;
			} else {
				outval = ((outval << 16) | t) >>> 0;
				shiftbuffer = (shiftbuffer << 16) >>> 0;
				tmp_nbits += 16;
				if (tmp_nbits == 32) {
					//thisline_changed |= *dataptr ^ outval; *dataptr++ = outval;
					thisline_changed |= line_data[next_lineno][plane][dataptr] ^ outval;
					line_data[next_lineno][plane][dataptr++] = outval;
					tmp_nbits = 0;
				}
			}
			nwords--;
			if (dma) {
				//fetchval = do_get_mem_word (real_pt); real_pt++;
				//fetchval = AMIGA.mem.load16_chip(real_pt); real_pt += 2;
				fetchval = AMIGA.custom.last_value = AMIGA.mem.chip.data[real_pt >>> 1];
				real_pt += 2;
			}
		}
		fetched[plane] = fetchval;
		todisplay[plane][0] = shiftbuffer;
		outword[plane] = outval;
	};	

	this.do_long_fetch = function (hpos, nwords, dma, fm) {
		var i;

		this.flush_display(fm);
		switch (fm) {
			case 0:
				if (out_nbits & 15) {
					for (i = 0; i < toscr_nr_planes; i++)
						this.long_fetch_ecs(i, nwords, 1, dma);
				} else {
					for (i = 0; i < toscr_nr_planes; i++)
						this.long_fetch_ecs(i, nwords, 0, dma);
				}
				break;
			/*#ifdef AGA
			 case 1:
			 if (out_nbits & 15) {
			 for (i = 0; i < toscr_nr_planes; i++)
			 this.long_fetch_aga(i, nwords, 1, 1, dma);
			 } else {
			 for (i = 0; i < toscr_nr_planes; i++)
			 this.long_fetch_aga(i, nwords, 0, 1, dma);
			 }
			 break;
			 case 2:
			 if (out_nbits & 15) {
			 for (i = 0; i < toscr_nr_planes; i++)
			 this.long_fetch_aga(i, nwords, 1, 2, dma);
			 } else {
			 for (i = 0; i < toscr_nr_planes; i++)
			 this.long_fetch_aga(i, nwords, 0, 2, dma);
			 }
			 break;
			 #endif*/
		}
		out_nbits += nwords * 16;
		out_offs += out_nbits >> 5;
		out_nbits &= 31;

		if (dma && toscr_nr_planes > 0)
			fetch_state = FETCH_WAS_PLANE0;
	};

	this.add_modulos = function () {
		var m1, m2;

		if (fmode & 0x4000) {
			if (((diwstrt >> 8) ^ this.vpos) & 1)
				m1 = m2 = bpl2mod;
			else
				m1 = m2 = bpl1mod;
		} else {
			m1 = bpl1mod;
			m2 = bpl2mod;
		}

		switch (bplcon0_planes_limit) {
			/*#ifdef AGA
			 case 8: bplpt[7] += m2; bplptx[7] += m2;
			 case 7: bplpt[6] += m1; bplptx[6] += m1;
			 #endif*/
			case 6:
				bplpt[5] += m2;
				bplptx[5] += m2;
			case 5:
				bplpt[4] += m1;
				bplptx[4] += m1;
			case 4:
				bplpt[3] += m2;
				bplptx[3] += m2;
			case 3:
				bplpt[2] += m1;
				bplptx[2] += m1;
			case 2:
				bplpt[1] += m2;
				bplptx[1] += m2;
			case 1:
				bplpt[0] += m1;
				bplptx[0] += m1;
		}
	};	
	
	this.fetch = function (nr, fm, hpos) {
		if (nr < bplcon0_planes_limit) {
			var p = bplpt[nr];
			bplpt[nr] += (2 << fm);
			bplptx[nr] += (2 << fm);
			if (nr == 0)
				bpl1dat_written = true;

			switch (fm) {
				case 0:
					//fetched[nr] = bplxdat[nr] = last_custom_value1 = chipmem_wget_indirect (p);
					//fetched[nr] = bplxdat[nr] = AMIGA.mem.load16_chip(p);
					fetched[nr] = bplxdat[nr] = AMIGA.custom.last_value = AMIGA.mem.chip.data[p >>> 1];
					break;
				/*#ifdef AGA
				 case 1:
				 fetched_aga0[nr] = chipmem_lget_indirect (p);
				 last_custom_value1 = (uae_u16)fetched_aga0[nr];
				 break;
				 case 2:
				 fetched_aga1[nr] = chipmem_lget_indirect (p);
				 fetched_aga0[nr] = chipmem_lget_indirect (p + 4);
				 last_custom_value1 = (uae_u16)fetched_aga0[nr];
				 break;
				 #endif*/
			}
			if (plf_state == PLF_PASSED_STOP2 && fetch_cycle >= (fetch_cycle & ~fetchunit_mask) + fetch_modulo_cycle) {
				var mod;
				if (fmode & 0x4000) {
					if (((diwstrt >> 8) ^ this.vpos) & 1)
						mod = bpl2mod;
					else
						mod = bpl1mod;
				} else if (nr & 1)
					mod = bpl2mod;
				else
					mod = bpl1mod;

				bplpt[nr] += mod;
				bplptx[nr] += mod;
			}
		} else {
			if (nr < MAX_PLANES) //FIX for illegal memory access if not #ifdef AGA
				fetched[nr] = bplxdat[nr];
		}
	};

	this.one_fetch_cycle = function (pos, ddfstop_to_test, dma, fm) {
		if (plf_state < PLF_PASSED_STOP && pos == ddfstop_to_test)
			plf_state = PLF_PASSED_STOP;

		if ((fetch_cycle & fetchunit_mask) == 0) {
			if (plf_state == PLF_PASSED_STOP2) {
				this.finish_final_fetch(pos, fm);
				return 1;
			}
			if (plf_state == PLF_PASSED_STOP)
				plf_state = PLF_PASSED_STOP2;
			else if (plf_state == PLF_PASSED_STOP2)
				plf_state = PLF_END;
		}
		this.maybe_check(pos);

		if (dma) {
			var cycle_start = fetch_cycle & fetchstart_mask;
			switch (fm_maxplane) {
				case 8:
					switch (cycle_start) {
						case 0:
							this.fetch(7, fm, pos);
							break;
						case 1:
							this.fetch(3, fm, pos);
							break;
						case 2:
							this.fetch(5, fm, pos);
							break;
						case 3:
							this.fetch(1, fm, pos);
							break;
						case 4:
							this.fetch(6, fm, pos);
							break;
						case 5:
							this.fetch(2, fm, pos);
							break;
						case 6:
							this.fetch(4, fm, pos);
							break;
						case 7:
							this.fetch(0, fm, pos);
							break;
					}
					break;
				case 4:
					switch (cycle_start) {
						case 0:
							this.fetch(3, fm, pos);
							break;
						case 1:
							this.fetch(1, fm, pos);
							break;
						case 2:
							this.fetch(2, fm, pos);
							break;
						case 3:
							this.fetch(0, fm, pos);
							break;
					}
					break;
				case 2:
					switch (cycle_start) {
						case 0:
							this.fetch(1, fm, pos);
							break;
						case 1:
							this.fetch(0, fm, pos);
							break;
					}
					break;
			}
		}
		if (bpl1dat_written) {
			fetch_state = FETCH_WAS_PLANE0;
			bpl1dat_written = false;
		}

		fetch_cycle++;
		toscr_nbits += (2 << toscr_res);

		if (toscr_nbits > 16) {
			Fatal(333, sprintf('one_fetch_cycle() toscr_nbits > 16 (%d)', toscr_nbits));
			toscr_nbits = 0;
		}
		if (toscr_nbits == 16)
			this.flush_display(fm);

		return 0;
	};
	
	this.update_fetch = function (until, fm) {
		var dma = AMIGA.dmaen(DMAF_BPLEN);

		if (this.nodraw() || plf_state == PLF_END)
			return;

		var ddfstop_to_test = HARD_DDF_STOP;
		if (ddfstop >= last_fetch_hpos && plfstop < ddfstop_to_test)
			ddfstop_to_test = plfstop;

		this.update_toscr_planes();

		var pos = last_fetch_hpos;
		cycle_diagram_shift = last_fetch_hpos - fetch_cycle;

		for (; ; pos++) {
			if (pos == until) {
				if (until >= this.maxhpos) {
					this.finish_final_fetch(pos, fm);
					return;
				}
				this.flush_display(fm);
				return;
			}
			if (fetch_state == FETCH_WAS_PLANE0)
				break;

			fetch_state = FETCH_STARTED;
			if (this.one_fetch_cycle(pos, ddfstop_to_test, dma, fm))
				return;
		}

		// Unrolled version of the for loop below.
		if (1
			&& plf_state < PLF_PASSED_STOP && ddf_change != this.vpos && ddf_change + 1 != this.vpos
			&& dma
			&& (fetch_cycle & fetchstart_mask) == (fm_maxplane & fetchstart_mask)
			&& !badmode
			//&& (out_nbits & 15) == 0
			&& toscr_nr_planes == thisline_decision.nr_planes) {
			var offs = (pos - fetch_cycle) & fetchunit_mask;
			var ddf2 = ((ddfstop_to_test - offs + fetchunit - 1) & ~fetchunit_mask) + offs;
			var ddf3 = ddf2 + fetchunit;
			var stop = until < ddf2 ? until : until < ddf3 ? ddf2 : ddf3;
			var count = stop - pos;

			if (count >= fetchstart) {
				count &= ~fetchstart_mask;

				if (thisline_decision.plfleft < 0) {
					this.compute_delay_offset();
					this.compute_toscr_delay_1(bplcon1);
				}

				this.do_long_fetch(pos, count >> (3 - toscr_res), dma, fm);

				this.maybe_first_bpl1dat(pos);

				if (pos <= ddfstop_to_test && pos + count > ddfstop_to_test)
					plf_state = PLF_PASSED_STOP;
				if (pos <= ddfstop_to_test && pos + count > ddf2)
					plf_state = PLF_PASSED_STOP2;
				if (pos <= ddf2 && pos + count >= ddf2 + fm_maxplane)
					this.add_modulos();
				pos += count;
				fetch_cycle += count;
			}
		}

		for (; pos < until; pos++) {
			if (fetch_state == FETCH_WAS_PLANE0) {
				this.beginning_of_plane_block(pos, fm);
				this.estimate_last_fetch_cycle(pos);
			}
			fetch_state = FETCH_STARTED;
			if (this.one_fetch_cycle(pos, ddfstop_to_test, dma, fm))
				return;
		}
		if (until >= this.maxhpos) {
			this.finish_final_fetch(pos, fm);
			return;
		}
		this.flush_display(fm);
	};	
	
	this.update_fetch_x = function (until, fm) {
		if (this.nodraw())
			return;

		var pos = last_fetch_hpos;
		this.update_toscr_planes();

		for (; pos < until; pos++) {
			toscr_nbits += (2 << toscr_res);
			if (toscr_nbits > 16) {
				Fatal(333, sprintf('update_fetch_x() xtoscr_nbits > 16 (%d)', toscr_nbits));
				toscr_nbits = 0;
			}
			if (toscr_nbits == 16)
				this.flush_display(fm);
		}
		if (until >= this.maxhpos) {
			this.finish_final_fetch(pos, fm);
			return;
		}
		this.flush_display(fm);
	};
		
	this.decide_fetch = function (hpos) {
		if (hpos > last_fetch_hpos) {
			if (fetch_state != FETCH_NOT_STARTED) {
				this.update_fetch(hpos, fetchmode);
				//cycle_diagram_shift = hpos - fetch_cycle;
			} else if (bpl1dat_written_at_least_once) {
				this.update_fetch_x(hpos, fetchmode);
				bpl1dat_written = false;
			}
			this.maybe_check(hpos);
			last_fetch_hpos = hpos;
		}
	};
	
	/*this.decide_fetch_ce = function (hpos) {
		if ((ddf_change == this.vpos || ddf_change + 1 == this.vpos) && this.vpos < this.current_maxvpos())
			this.decide_fetch(hpos);
	};*/
	
	this.estimate_last_fetch_cycle = function (hpos) {
		var fetchunit = fetchunits[fetchmode * 4 + bplcon0_res];

		if (plf_state < PLF_PASSED_STOP) {
			var stop = plfstop < hpos || plfstop > HARD_DDF_STOP ? HARD_DDF_STOP : plfstop;
			var fetch_cycle_at_stop = fetch_cycle + (stop - hpos);
			var starting_last_block_at = (fetch_cycle_at_stop + fetchunit - 1) & ~(fetchunit - 1);

			estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + fetchunit;
		} else {
			var starting_last_block_at = (fetch_cycle + fetchunit - 1) & ~(fetchunit - 1);
			if (plf_state == PLF_PASSED_STOP2)
				starting_last_block_at -= fetchunit;

			estimated_last_fetch_cycle = hpos + (starting_last_block_at - fetch_cycle) + fetchunit;
		}
	};
	
	/*---------------------------------*/   
	
	this.vsync_handler_post = function () {
		if (bplcon0 & 4)
			this.lof_store = this.lof_store ? 0 : 1;
		this.lof_current = this.lof_store;
		if (lof_togglecnt_lace >= LOF_TOGGLES_NEEDED) {
			interlace_changed = this.notice_interlace_seen(true);
			if (interlace_changed)
				this.notice_screen_contents_lost();
		} else if (lof_togglecnt_nlace >= LOF_TOGGLES_NEEDED) {
			interlace_changed = this.notice_interlace_seen(false);
			if (interlace_changed)
				this.notice_screen_contents_lost();
		}
		if (this.lof_changing) {
			// still same? Trigger change now.
			if ((!this.lof_store && this.lof_changing < 0) || (this.lof_store && this.lof_changing > 0)) {
				this.lof_changed = 1;
			}
			this.lof_changing = 0;
		}

		/*#ifdef PICASSO96
		 if (p96refresh_active) {
		 vpos_count = p96refresh_active;
		 vtotal = vpos_count;
		 }
		 #endif*/

		if ((beamcon0 & (0x20 | 0x80)) != (new_beamcon0 & (0x20 | 0x80)) || (this.vpos_count > 0 && Math.abs(this.vpos_count - this.vpos_count_diff) > 1) || this.lof_changed)
			this.init_hz(false);
		else if (interlace_changed)
			this.compute_framesync();

		this.lof_changed = 0;

		AMIGA.copper.COPJMP(1, 1);

		this.init_hardware_frame();
	};	
	
	this.hsync_scandoubler = function () {
		console.log('hsync_scandoubler');
		var bpltmp = [0, 0, 0, 0, 0, 0, 0, 0], bpltmpx = [0, 0, 0, 0, 0, 0, 0, 0];

		next_lineno++;
		//scandoubled_line = 1;

		for (var i = 0; i < 8; i++) {
			bpltmp[i] = bplpt[i];
			bpltmpx[i] = bplptx[i];
			if (prevbpl[this.lof_store][this.vpos][i] && prevbpl[1 - this.lof_store][this.vpos][i]) {
				var diff = prevbpl[this.lof_store][this.vpos][i] - prevbpl[1 - this.lof_store][this.vpos][i];
				if (this.lof_store) {
					if (bplcon0 & 4)
						bplpt[i] = prevbpl[this.lof_store][this.vpos][i] - diff;
				} else {
					if (bplcon0 & 4)
						bplpt[i] = prevbpl[this.lof_store][this.vpos][i];
					else
						bplpt[i] = bplpt[i] - diff;

				}
			}
		}

		this.reset_decisions();
		plf_state = PLF_IDLE;

		// copy color changes
		var dip1 = curr_drawinfo[next_lineno - 1];
		for (var idx1 = dip1.first_color_change; idx1 < dip1.last_color_change; idx1++) {
			var cs2 = curr_color_changes[idx1];
			var regno = cs2.regno;
			var hpos = cs2.linepos;
			if (regno < 0x1000 && hpos < HBLANK_OFFSET && !(beamcon0 & 0x80) && prev_lineno >= 0) {
				var pdip = curr_drawinfo[next_lineno - 1];
				var idx = pdip.last_color_change;
				pdip.last_color_change++;
				pdip.nr_color_changes++;
				curr_color_changes[idx].linepos = hpos + this.maxhpos + 1;
				curr_color_changes[idx].regno = regno;
				curr_color_changes[idx].value = cs2.value;
				curr_color_changes[idx + 1].regno = -1;
			} else {
				var cs1 = curr_color_changes[next_color_change];
				cs1.set(cs2); //memcpy (cs1, cs2, sizeof (struct ColorChange));
				next_color_change++;
			}
		}

		curr_color_changes[next_color_change].regno = -1;

		this.finish_decisions();
		this.hsync_record_line_state(next_lineno, NLN_NORMAL, thisline_changed);
		this.hardware_line_completed(next_lineno);
		//scandoubled_line = 0;

		for (var i = 0; i < 8; i++) {
			bplpt[i] = bpltmp[i];
			bplptx[i] = bpltmpx[i];
		}
	};
	
	this.hsync_handler_pre = function () {
		this.finish_decisions();
		if (thisline_decision.plfleft >= 0) {
			if (AMIGA.config.chipset.collision_level > 1)
				this.do_sprite_collisions();
			if (AMIGA.config.chipset.collision_level > 2)
				this.do_playfield_collisions();
		}
		this.hsync_record_line_state(next_lineno, nextline_how, thisline_changed);
		if (this.vpos == sprite_vblank_endline) {
			//lightpen_triggered = 0;
			sprite_0 = 0;
		}
		/*if (lightpen_cx > 0 && (bplcon0 & 8) && !lightpen_triggered && lightpen_cy == this.vpos) {
		 vpos_lpen = this.vpos;
		 hpos_lpen = lightpen_cx;
		 lightpen_triggered = 1;
		 }*/
		this.hardware_line_completed(next_lineno);
		if (this.doflickerfix() && interlace_seen > 0)
			this.hsync_scandoubler();
	};     
		
	this.hsync_handler_pre_next_vpos = function (onvsync) {
		if (this.is_linetoggle())
			this.lol ^= 1;
		else
			this.lol = 0;

		this.vpos++;
		this.vpos_count++;
		if (this.vpos >= this.maxvpos_total)
			this.vpos = 0;
		if (onvsync) {
			this.vpos = 0;
			//vsync_counter++;
		}
		this.maxhpos = this.maxhpos_short + this.lol;
	};
		
	this.hsync_handler_post = function () {
		if (this.vpos == equ_vblank_endline + 1) {
			//if (this.lof_current != this.lof_store) {}
			if (this.lof_store != this.lof_previous) {
				if (lof_togglecnt_lace < LOF_TOGGLES_NEEDED)
					lof_togglecnt_lace++;
				if (lof_togglecnt_lace >= LOF_TOGGLES_NEEDED)
					lof_togglecnt_nlace = 0;
			} else {
				if (lof_togglecnt_nlace < LOF_TOGGLES_NEEDED)
					lof_togglecnt_nlace++;
				if (lof_togglecnt_nlace >= LOF_TOGGLES_NEEDED)
					lof_togglecnt_lace = 0;
			}
			this.lof_previous = this.lof_store;
		}
	};
			
	this.hsync_handler_post_nextline_how = function () {
		var lineno = this.vpos;
		if (lineno >= MAXVPOS)
			lineno %= MAXVPOS;
		nextline_how = NLN_NORMAL;
		if (this.doflickerfix() && interlace_seen > 0)
			lineno *= 2;
		else if (AMIGA.config.video.vresolution && (doublescan <= 0 || interlace_seen > 0)) {
			lineno *= 2;
			nextline_how = AMIGA.config.video.vresolution > VRES_NONDOUBLE && AMIGA.config.video.scanlines == false ? NLN_DOUBLED : NLN_NBLACK;
			if (interlace_seen) {
				if (!this.lof_current) {
					lineno++;
					nextline_how = NLN_LOWER;
				} else {
					nextline_how = NLN_UPPER;
				}
			}
		}
		prev_lineno = next_lineno;
		next_lineno = lineno;
		this.reset_decisions();

		plfstrt_sprite = plfstrt;
	};
	
	this.hsync_handler_post_diw_change = function () {
		if (GET_PLANES(bplcon0) > 0 && AMIGA.dmaen(DMAF_BPLEN)) {
			if (this.vpos > last_planes_vpos)
				last_planes_vpos = this.vpos;
			if (this.vpos >= minfirstline && first_planes_vpos == 0)
				first_planes_vpos = this.vpos > minfirstline ? this.vpos - 1 : this.vpos;
			else if (this.vpos >= this.current_maxvpos() - 1)
				last_planes_vpos = this.current_maxvpos();
		}
		if (diw_change == 0) {
			if (this.vpos >= first_planes_vpos && this.vpos <= last_planes_vpos) {
				if (diwlastword > diwlastword_total) {
					diwlastword_total = diwlastword;
					if (diwlastword_total > coord_diw_to_window_x(hsyncstartpos * 2))
						diwlastword_total = coord_diw_to_window_x(hsyncstartpos * 2);
				}
				if (diwfirstword < diwfirstword_total) {
					diwfirstword_total = diwfirstword;
					if (diwfirstword_total < coord_diw_to_window_x(hsyncendpos * 2))
						diwfirstword_total = coord_diw_to_window_x(hsyncendpos * 2);
					firstword_bplcon1 = bplcon1;
				}
			}
			if (diwstate == DIW_WAITING_STOP) {
				var f = 8 << fetchmode;
				if (plfstrt + f < ddffirstword_total + f)
					ddffirstword_total = plfstrt + f;
				if (plfstop + 2 * f > ddflastword_total + 2 * f)
					ddflastword_total = plfstop + 2 * f;
			}
			if ((plffirstline < plffirstline_total || (plffirstline_total == minfirstline && this.vpos > minfirstline)) && plffirstline < (this.vpos >> 1)) {
				firstword_bplcon1 = bplcon1;
				if (plffirstline < minfirstline)
					plffirstline_total = minfirstline;
				else
					plffirstline_total = plffirstline;
			}
			if (plflastline > plflastline_total && plflastline > plffirstline_total && plflastline > (this.maxvpos >> 1))
				plflastline_total = plflastline;
		}
		if (diw_change > 0)
			diw_change--;
	};	
	
	/*---------------------------------*/   

	this.getDiwstate = function () {
		return diwstate;
	};
	
	this.getData = function () {
		return [
			thisline_decision.plfleft,
			thisline_decision.plfright - (16 << fetchmode),
			cycle_diagram_total_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)],
			cycle_diagram_free_cycles[fetchmode][GET_RES_AGNUS(bplcon0)][GET_PLANES_LIMIT(bplcon0)]
		];
	};
	
	/*---------------------------------*/   

	this.setup = function () {
		if (cycle_diagram_table === null)
			create_cycle_diagram_table();

		if (AMIGA.video.available == 1)
			alloc_colors64k(4, 4, 4, 8, 4, 0, 0, 0, 0, 0);
		else
			alloc_colors64k(5, 6, 5, 11, 5, 0, 0, 0, 0, 0);

		notice_new_xcolors();

		this.setup_drawing();
		this.setup_sprites();
	};

	this.cleanup = function () {
		this.cleanup_sprites();
		this.cleanup_drawing();
	};

	this.reset = function() {
		/*lightpen_active = -1;
		lightpen_triggered = 0;
		lightpen_cx = lightpen_cy = -1;*/

		update_mirrors();
		
		if (!aga_mode) {
			for (i = 0; i < 32; i++) {
				current_colors.color_regs_ecs[i] = 0;
				current_colors.acolors[i] = getxcolor(0);
			}
/*#ifdef AGA
		} else {
			for (i = 0; i < 256; i++) {
				current_colors.color_regs_aga[i] = 0;
				current_colors.acolors[i] = getxcolor(0);
			}
#endif*/
		}

		clxdat = 0;

		/* Clear the armed flags of all sprites.  */
		for (var i = 0; i < MAX_SPRITES; i++) spr[i].clr();
		nr_armed = 0;

		bplcon0 = 0;
		bplcon3 = 0x0C00;
		bplcon4 = 0x0011; // Get AGA chipset into ECS compatibility mode

		diwhigh = 0;
		diwhigh_written = false;
		hdiwstate = DIW_WAITING_START; // this does not reset at vblank

		this.FMODE(0, 0);
		this.CLXCON(0);
		this.CLXCON2(0);
		this.setup_fmodes(0);
		//sprite_width = GET_SPRITEWIDTH(fmode);
		beamcon0 = new_beamcon0 = AMIGA.config.video.ntsc ? 0x00 : 0x20;
		this.lof_store = this.lof_current = 1;

		this.vpos = 0;
		this.vpos_count = this.vpos_count_diff = 0;

		//timehack_alive = 0;

		curr_sprite_entries = null;
		prev_sprite_entries = null;
		sprite_entries[0][0].first_pixel = 0;
		sprite_entries[1][0].first_pixel = MAX_SPR_PIXELS;
		sprite_entries[0][1].first_pixel = 0;
		sprite_entries[1][1].first_pixel = MAX_SPR_PIXELS;
		for (var i = 0; i < spixels.length; i++) spixels[i] = 0; //memset (spixels, 0, 2 * MAX_SPR_PIXELS * sizeof *spixels);
		for (var i = 0; i < spixstate.length; i++) spixstate[i] = 0; //memset (&spixstate, 0, sizeof spixstate);
		
		diwstate = DIW_WAITING_START;

		this.init_hz(true);
		//vpos_lpen = -1;
		this.lof_changing = 0;
		this.lof_previous = this.lof_store;
		lof_togglecnt_nlace = lof_togglecnt_lace = 0;
		nlace_cnt = NLACE_CNT_NEEDED;

		this.reset_sprites();
		this.init_hardware_frame();
		this.reset_drawing();
		this.reset_decisions();

		sprres = expand_sprres(bplcon0, bplcon3);
		sprite_width = GET_SPRITEWIDTH(fmode);
		this.setup_fmodes(0);

/*#ifdef PICASSO96
		picasso_reset();
#endif*/
	}	
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function RTC() {
	const RF5C01A_RAM_SIZE = 16;

	var clock_control_d;
	var clock_control_e;
	var clock_control_f;

	var rtc_memory = null;
	var rtc_alarm = null;

	this.read = function () {
		/*struct zfile *f;
		 f = zfile_fopen (currprefs.flashfile, "rb", ZFD_NORMAL);
		 if (f) {
		 zfile_fread (rtc_memory, RF5C01A_RAM_SIZE, 1, f);
		 zfile_fread (rtc_alarm, RF5C01A_RAM_SIZE, 1, f);
		 zfile_fclose (f);
		 }*/
	};
	this.write = function () {
		/*struct zfile *f = zfile_fopen (currprefs.flashfile, L"rb+", ZFD_NORMAL);
		 if (!f) {
		 f = zfile_fopen (currprefs.flashfile, L"wb", 0);
		 if (f) {
		 zfile_fwrite (rtc_memory, RF5C01A_RAM_SIZE, 1, f);
		 zfile_fwrite (rtc_alarm, RF5C01A_RAM_SIZE, 1, f);
		 zfile_fclose (f);
		 }
		 return;
		 }
		 zfile_fseek (f, 0, SEEK_END);
		 if (zfile_ftell (f) <= 2 * RF5C01A_RAM_SIZE) {
		 zfile_fseek (f, 0, SEEK_SET);
		 zfile_fwrite (rtc_memory, RF5C01A_RAM_SIZE, 1, f);
		 zfile_fwrite (rtc_alarm, RF5C01A_RAM_SIZE, 1, f);
		 }
		 zfile_fclose (f);*/
	};

	this.setup = function () {
		BUG.info('RTC.setup() type ' + (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B ? 'MSM6242B' : 'RF5C01A'));

		if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B) {
			clock_control_d = 0x1;
			clock_control_e = 0;
			clock_control_f = 0x4;
			/* 24/12 */
		} else if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_RF5C01A) {
			clock_control_d = 0x4;
			/* Timer EN */
			clock_control_e = 0;
			clock_control_f = 0;

			rtc_memory = new Uint8Array(RF5C01A_RAM_SIZE);
			rtc_alarm = new Uint8Array(RF5C01A_RAM_SIZE);

			for (var i = 0; i < RF5C01A_RAM_SIZE; i++)
				rtc_memory[i] = rtc_alarm[i] = 0;

			this.read();
		}
	};

	this.load8 = function (addr) {
		addr &= 0x3f;
		if ((addr & 3) == 2 || (addr & 3) == 0 || AMIGA.config.rtc.type == SAEV_Config_RTC_Type_None) {
			if (AMIGA.config.cpu.model == 68000 && AMIGA.config.cpu.compatible)
				return 0xff; //regs.irc >> 8;
			return 0;
		}
		var t = new Date();

		addr >>= 2;
		if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B) {
			switch (addr) {
				case 0x0:
					return t.getSeconds() % 10;
				case 0x1:
					return Math.floor(t.getSeconds() / 10);
				case 0x2:
					return t.getMinutes() % 10;
				case 0x3:
					return Math.floor(t.getMinutes() / 10);
				case 0x4:
					return t.getHours() % 10;
				case 0x5:
					return Math.floor(t.getHours() / 10);
				case 0x6:
					return t.getDate() % 10;
				case 0x7:
					return Math.floor(t.getDate() / 10);
				case 0x8:
					return (t.getMonth() + 1) % 10;
				case 0x9:
					return Math.floor((t.getMonth() + 1) / 10);
				case 0xA:
					return (t.getFullYear() - 1900) % 10;
				case 0xB:
					return Math.floor((t.getFullYear() - 1900) / 10);
				case 0xC:
					return t.getDay();
				case 0xD:
					return clock_control_d;
				case 0xE:
					return clock_control_e;
				case 0xF:
					return clock_control_f;
			}
		} else if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_RF5C01A) {
			var bank = clock_control_d & 3;

			if (bank >= 2 && addr < 0x0d) return (rtc_memory[addr] >> ((bank == 2) ? 0 : 4)) & 0x0f;
			if (bank == 1 && addr < 0x0d) return rtc_alarm[addr];

			switch (addr) {
				case 0x0:
					return t.getSeconds() % 10;
				case 0x1:
					return Math.floor(t.getSeconds() / 10);
				case 0x2:
					return t.getMinutes() % 10;
				case 0x3:
					return Math.floor(t.getMinutes() / 10);
				case 0x4:
					return t.getHours() % 10;
				case 0x5:
					return Math.floor(t.getHours() / 10);
				case 0x6:
					return t.getDate() % 10;
				case 0x7:
					return Math.floor(t.getDate() / 10);
				case 0x8:
					return (t.getMonth() + 1) % 10;
				case 0x9:
					return Math.floor((t.getMonth() + 1) / 10);
				case 0xA:
					return (t.getFullYear() - 1900) % 10;
				case 0xB:
					return Math.floor((t.getFullYear() - 1900) / 10);
				case 0xC:
					return t.getDay();
				case 0xD:
					return clock_control_d;
				/* E and F = write-only */
			}
		}
		return 0;
	};

	this.load16 = function (addr) {
		return (this.load8(addr) << 8) | this.load8(addr + 1);
	};

	this.load32 = function (addr) {
		return ((this.load16(addr) << 16) | this.load16(addr + 2)) >>> 0;
	};

	this.store8 = function (addr, value) {
		addr &= 0x3f;
		if ((addr & 1) != 1 || AMIGA.config.rtc.type == SAEV_Config_RTC_Type_None) return;

		addr >>= 2;
		value &= 0x0f;
		if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_MSM6242B) {
			switch (addr) {
				case 0xD:
					clock_control_d = value & (1 | 8);
					break;
				case 0xE:
					clock_control_e = value;
					break;
				case 0xF:
					clock_control_f = value;
					break;
			}
		} else if (AMIGA.config.rtc.type == SAEV_Config_RTC_Type_RF5C01A) {
			var bank = clock_control_d & 3;

			if (bank >= 2 && addr < 0x0d) {
				rtc_memory[addr] &= ((bank == 2) ? 0xf0 : 0x0f);
				rtc_memory[addr] |= value << ((bank == 2) ? 0 : 4);

				//var ov = rtc_memory[addr];
				if (rtc_memory[addr] != value) this.write();
				return;
			}
			if (bank == 1 && addr < 0x0d) {
				rtc_alarm[addr] = value;
				rtc_alarm[0] = rtc_alarm[1] = rtc_alarm[9] = rtc_alarm[12] = 0;
				rtc_alarm[3] &= ~0x8;
				rtc_alarm[5] &= ~0xc;
				rtc_alarm[6] &= ~0x8;
				rtc_alarm[8] &= ~0xc;
				rtc_alarm[10] &= ~0xe;
				rtc_alarm[11] &= ~0xc;

				//var ov = rtc_alarm[addr];
				if (rtc_alarm[addr] != value) this.write();
				return;
			}
			switch (addr) {
				case 0xD:
					clock_control_d = value;
					break;
				case 0xE:
					clock_control_e = value;
					break;
				case 0xF:
					clock_control_f = value;
					break;
			}
		}

	};

	this.store16 = function (addr, value) {
		this.store8(addr, (value >> 8) & 0xff);
		this.store8(addr + 1, value & 0xff);
	};

	this.store32 = function (addr, value) {
		this.store16(addr, (value >>> 16) & 0xffff);
		this.store16(addr + 2, value & 0xffff);
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Serial()
{
	var buf = new Uint8Array(1024);
	var pos = 0, dtr = false;
	var serper = 0, serdat = 0x2000;

	this.reset = function () {
		this.flushBuffer();

		pos = 0;
		dtr = false;
		serper = 0;
		serdat = 0x2000;
	};
	
	this.flushBuffer = function () {
		if (pos > 0) {
			var str = '';
			for (var i = 0; i < pos; i++) {
				/*if (buf[i] == 13)
				 str += '<br/>';
				 else if (buf[i] == 9)
				 str += '&nbsp;&nbsp;&nbsp;';
				 else*/
				str += String.fromCharCode(buf[i]);
			}
			pos = 0;
			BUG.col = 3;
			BUG.info(str);
			BUG.col = 1;
		}
	};

	this.readStatus = function () {
		//ciabpra |= 0x20; //Push up Carrier Detect line
		//ciabpra |= 0x08; //DSR ON
		return 0;
	};

	this.writeStatus = function (old, nw) {
		if ((old & 0x80) == 0x80 && (nw & 0x80) == 0x00) dtr = true;
		if ((old & 0x80) == 0x00 && (nw & 0x80) == 0x80) dtr = false;
		//if ((old & 0x40) != (nw & 0x40)) BUG.info('RTS %s.', (nw & 0x40) == 0x40 ? 'set' : 'clr');
		//if ((old & 0x10) != (nw & 0x10)) BUG.info('CTS %s.', (nw & 0x10) == 0x10 ? 'set' : 'clr');
		return nw;
	};

	this.SERPER = function (v) {
		if (serper != v)
			serper = v;
	};

	this.SERDAT = function (v) {
		//BUG.info('SERDAT $%04x', v);

		if (AMIGA.config.serial.enabled) {
			buf[pos++] = v & 0xff;
			if (pos == 1024)
				this.flushBuffer();
		}
		serdat |= 0x2000;
		/* Set TBE in the SERDATR ... */
		AMIGA.intreq |= 1;
		/* ... and in INTREQ register */
	};

	this.SERDATR = function()
	{
		//BUG.info('SERDATR $%04x', serdat);
		return serdat;
	}
}

/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

/* moving average algorithm */

function MAvg(size) {
	this.values = new Array(size);
	this.size = size;
	this.usage = 0;
	this.offset = 0;
	this.average = 0;

	this.clr = function () {
		this.usage = 0;
		this.offset = 0;
		this.average = 0;
	};

	this.set = function(newval) {
		if (this.usage < this.size) {
			this.values[this.usage++] = newval;
			this.average += newval;
		} else {
			this.average -= this.values[this.offset];
			this.values[this.offset] = newval;
			this.average += newval;
			if (++this.offset >= this.size)
				this.offset -= this.size;
		}
		return Math.floor(this.average / this.usage);
	}
}

/*-----------------------------------------------------------------------*/

/*function crc32(str, crc) {
	const tab =
	'00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 '+
	'0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 '+
	'1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 '+
	'136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 '+ 
	'3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B '+ 
	'35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 '+ 
	'26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F '+ 
	'2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D '+ 
	'76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 '+ 
	'7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 '+
	'6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 '+ 
	'65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 '+ 
	'4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB '+ 
	'4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 '+ 
	'5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F '+ 
	'5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD '+ 
	'EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 '+ 
	'E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 '+ 
	'F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 '+ 
	'FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 '+ 
	'D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B '+ 
	'D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 '+
	'CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F '+ 
	'C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D '+ 
	'9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 '+ 
	'95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 '+ 
	'86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 '+ 
	'88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 '+ 
	'A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB '+ 
	'AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 '+ 
	'BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF '+ 
	'B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D';

	if (crc == window.undefined) crc = 0;

	crc = crc ^ (-1);
	for (var i = 0, len = str.length; i < len; i++)
		crc = (crc >>> 8) ^ parseInt(tab.substr(((crc ^ str.charCodeAt(i)) & 0xff) * 9, 8), 16);
	crc = crc ^ (-1);
	
	return crc < 0 ? crc + 0x100000000 : crc;
}*/

/*-----------------------------------------------------------------------*/
/*
*  Javascript sprintf
*  http://www.webtoolkit.info/
*/
 
sprintfWrapper = {
	init: function () {
		if (typeof arguments == "undefined") {
			return null;
		}
		if (arguments.length < 1) {
			return null;
		}
		if (typeof arguments[0] != "string") {
			return null;
		}
		if (typeof RegExp == "undefined") {
			return null;
		}

		var string = arguments[0];
		var exp = new RegExp(/(%([%]|(\-)?(\+|\x20)?(0)?(\d+)?(\.(\d)?)?([bcdfosxX])))/g);
		var matches = [];
		var strings = [];
		var convCount = 0;
		var stringPosStart = 0;
		var stringPosEnd = 0;
		var matchPosEnd = 0;
		var newString = '';
		var match;

		while (match = exp.exec(string)) {
			if (match[9]) {
				convCount += 1;
			}

			stringPosStart = matchPosEnd;
			stringPosEnd = exp.lastIndex - match[0].length;
			strings[strings.length] = string.substring(stringPosStart, stringPosEnd);

			matchPosEnd = exp.lastIndex;
			matches[matches.length] = {
				match: match[0],
				left: match[3] ? true : false,
				sign: match[4] || '',
				pad: match[5] || ' ',
				min: match[6] || 0,
				precision: match[8],
				code: match[9] || '%',
				negative: !!(parseInt(arguments[convCount]) < 0),
				argument: String(arguments[convCount])
			};
		}
		strings[strings.length] = string.substring(matchPosEnd);

		if (matches.length == 0) {
			return string;
		}
		if ((arguments.length - 1) < convCount) {
			return null;
		}

		for (var i = 0; i < matches.length; i++) {
			var substitution;

			if (matches[i].code == '%') {
				substitution = '%'
			} else if (matches[i].code == 'b') {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(2));
				substitution = sprintfWrapper.convert(matches[i], true);
			} else if (matches[i].code == 'c') {
				matches[i].argument = String(String.fromCharCode(parseInt(Math.abs(parseInt(matches[i].argument)))));
				substitution = sprintfWrapper.convert(matches[i], true);
			} else if (matches[i].code == 'd') {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == 'f') {
				matches[i].argument = String(Math.abs(parseFloat(matches[i].argument)).toFixed(matches[i].precision ? matches[i].precision : 6));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == 'o') {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(8));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == 's') {
				matches[i].argument = matches[i].argument.substring(0, matches[i].precision ? matches[i].precision : matches[i].argument.length);
				substitution = sprintfWrapper.convert(matches[i], true);
			} else if (matches[i].code == 'x') {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(16));
				substitution = sprintfWrapper.convert(matches[i]);
			} else if (matches[i].code == 'X') {
				matches[i].argument = String(Math.abs(parseInt(matches[i].argument)).toString(16));
				substitution = sprintfWrapper.convert(matches[i]).toUpperCase();
			} else {
				substitution = matches[i].match;
			}
			newString += strings[i];
			newString += substitution;

		}
		newString += strings[i];

		return newString;

	},

	convert: function (match, nosign) {
		if (nosign) {
			match.sign = '';
		} else {
			match.sign = match.negative ? '-' : match.sign;
		}
		var l = match.min - match.argument.length + 1 - match.sign.length;
		var pad = new Array(l < 0 ? 0 : l).join(match.pad);
		if (!match.left) {
			if (match.pad == "0" || nosign) {
				return match.sign + pad + match.argument;
			} else {
				return pad + match.sign + match.argument;
			}
		} else {
			if (match.pad == "0" || nosign) {
				return match.sign + match.argument + pad.replace(/0/g, ' ');
			} else {
				return match.sign + match.argument + pad;
			}
		}
	}
};

sprintf = sprintfWrapper.init;

/*-----------------------------------------------------------------------*/
/*
 * http://www.quirksmode.org/js/detect.html
 */

var BrowserDetect = {
	init: function () {
		this.browser = this.searchString(this.dataBrowser) || 'An unknown browser';
		this.version = this.searchVersion(navigator.userAgent) || this.searchVersion(navigator.appVersion) || 'an unknown version';
		this.OS = this.searchString(this.dataOS) || 'an unknown OS';
	},
	searchString: function (data) {
		for (var i = 0; i < data.length; i++) {
			var dataString = data[i].string;
			var dataProp = data[i].prop;
			this.versionSearchString = data[i].versionSearch || data[i].identity;
			if (dataString) {
				if (dataString.indexOf(data[i].subString) != -1) return data[i].identity;
			} else if (dataProp) return data[i].identity;
		}
		return '';
	},
	searchVersion: function (dataString) {
		var index = dataString.indexOf(this.versionSearchString);
		if (index == -1) return 0.0;
		return parseFloat(dataString.substring(index + this.versionSearchString.length + 1));
	},
	dataBrowser: [{
		string: navigator.userAgent,
		subString: 'Chrome',
		identity: 'Chrome'
	}, {
		string: navigator.userAgent,
		subString: 'OmniWeb',
		versionSearch: 'OmniWeb/',
		identity: 'OmniWeb'
	}, {
		string: navigator.vendor,
		subString: 'Apple',
		identity: 'Safari',
		versionSearch: 'Version'
	}, {
		prop: window.opera,
		identity: 'Opera',
		versionSearch: 'Version'
	}, {
		string: navigator.vendor,
		subString: 'iCab',
		identity: 'iCab'
	}, {
		string: navigator.vendor,
		subString: 'KDE',
		identity: 'Konqueror'
	}, {
		string: navigator.userAgent,
		subString: 'Firefox',
		identity: 'Firefox'
	}, {
		string: navigator.vendor,
		subString: 'Camino',
		identity: 'Camino'
	}, { // for newer Netscapes (6+)
		string: navigator.userAgent,
		subString: 'Netscape',
		identity: 'Netscape'
	}, {
		string: navigator.userAgent,
		subString: 'MSIE',
		identity: 'Explorer',
		versionSearch: 'MSIE'
	}, {
		string: navigator.userAgent,
		subString: 'Gecko',
		identity: 'Mozilla',
		versionSearch: 'rv'
	}, { // for older Netscapes (4-)
		string: navigator.userAgent,
		subString: 'Mozilla',
		identity: 'Netscape',
		versionSearch: 'Mozilla'
	}],
	dataOS: [{
		string: navigator.platform,
		subString: 'Win',
		identity: 'Windows'
	}, {
		string: navigator.platform,
		subString: 'Mac',
		identity: 'Mac'
	}, {
		string: navigator.userAgent,
		subString: 'iPhone',
		identity: 'iPhone/iPod'
	}, {
		string: navigator.platform,
		subString: 'Linux',
		identity: 'Linux'
	}]

};
BrowserDetect.init();

/*-----------------------------------------------------------------------*/

/*function dump(obj) {
	var out = '';
	if (obj) {
		for (var i in obj) {
			out += i + ': ' + obj[i] + '\n';
		}     
	} else
		out = 'undefined';

	alert(out);
}*/

/*-----------------------------------------------------------------------*/

function VSync(err, msg) {
	this.error = err;
	this.message = msg;
}
VSync.prototype = new Error;   

function FatalError(err, msg) {
	this.error = err;
	this.message = msg;
}
FatalError.prototype = new Error;

function Fatal(err, msg) {
	//alert(str);
	throw new FatalError(err, msg);
}

/*function SafeFatal(str) {
	alert(str);
	console.log(str);		
	//API_stop();	
	API({cmd:'stop'});
}*/

/*-----------------------------------------------------------------------*/

/*function loadLocal(id, callback) {
	var e = document.getElementById(id).files[0];
	var reader = new FileReader();
	reader.onload = callback;
	reader.readAsBinaryString(e);
}

function loadRemote(file, crc, callback) {
	//var url = 'http://'+window.location.hostname+'/'+file;
	var url = file;

	var req = new XMLHttpRequest();
	req.open('GET', url, true);	
	req.overrideMimeType('text\/plain; charset=x-user-defined');
	req.onreadystatechange = function(e) {
		if (req.readyState == 4) {
			if (req.status == 200) {
				var newcrc = crc32(req.responseText, 0);
				BUG.info('loadRemote() %s (length %d, crc32 $%08x)', file, req.responseText.length, newcrc);
				if (newcrc == crc)
					callback(req.responseText);
				else
					SafeFatal('Wrong checksum for file '+file);				
			} else
				SafeFatal('Can\'t download file '+file+' (http status: '+req.status+')');			
		}
	}
	req.send(null);			
}*/

/*-----------------------------------------------------------------------*/

function Debug() {
	//this.col = 1;
	this.on = 1;

	this.say = function (str) {
		if (this.on) {
			/*var e = document.createElement('span');
			 e.style.color = this.col == 1 ? '#888' : (this.col == 2 ? '#448' : '#484');
			 e.innerHTML = buf;
			 this.debug.appendChild(e);
			 this.debug.appendChild(document.createElement('br'));
			 this.debug.scrollTop = this.debug.scrollHeight;*/

			console.log(str);
			/*console.info(str);
			 console.warn(str);
			 console.error(str);
			 console.assert(str);*/
		}
	};
	
	this.info = function () {
		if (this.on) {
			var str = sprintf.apply(this, arguments);
			console.log(str);
		}
	}	
}

/*-----------------------------------------------------------------------*/

/*function Uint64(hi, lo) {
	this.hi = hi;
	this.lo = lo;

	this.or = function (v) {
		this.hi = (this.hi | v.hi) >>> 0;
		this.lo = (this.lo | v.lo) >>> 0;
	};

	this.lshift = function (n) {
		if (n) {
			if (n < 32) {
				var m = Math.pow(2, n) - 1;
				var t = this.lo & m;
				this.hi = ((this.hi << n) | t) >>> 0;
				this.lo = (this.lo << n) >>> 0;

				//BUG.info('lshift %d %x', n, m, t);
			} else {
				var t = this.lo;
				this.hi = (t << (n - 32)) >>> 0;
				this.lo = 0;

				//BUG.info('lshift %d %x', n, t);
			}
		}
	};

	this.rshift = function (n) {
		if (n) {
			if (n < 32) {
				var m = Math.pow(2, n) - 1;
				var t = this.hi & m;
				this.hi = (this.hi >>> n) >>> 0;
				this.lo = ((t << (32 - n)) | (this.lo >>> n)) >>> 0;

				//BUG.info('rshift %d %x %x', n, m, t);
			} else {
				var t = this.hi;
				this.hi = 0;
				this.lo = (t >>> (n - 32)) >>> 0;

				//BUG.info('rshift %d %x %x', n, t);
			}
		}
	};

	this.print = function() {
		BUG.info('$%08x%08x', this.hi, this.lo);
	} 	
}*/



/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* 2012-2015 Rupert Hausberger
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
**************************************************************************/

function Vide0() {
	const vertexShader = 
		'attribute vec2 a_position;'+
		'attribute vec2 a_texCoord;'+
		'uniform vec2 u_resolution;'+
		'varying vec2 v_texCoord;'+
		'void main() {'+
			'vec2 zeroToOne = a_position / u_resolution;'+
			'vec2 zeroToTwo = zeroToOne * 2.0;'+
			'vec2 clipSpace = zeroToTwo - 1.0;'+
			'gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);'+
			'v_texCoord = a_texCoord;'+
		'}';
	const fragmentShader = 
		'precision mediump float;'+
		'uniform sampler2D u_image;'+
		'varying vec2 v_texCoord;'+
		'void main() {'+
			'gl_FragColor = texture2D(u_image, v_texCoord);'+
		'}';	
	const glParams = {
		alpha: false,
		stencil: false,
		antialias: false
	};
	
	this.available = 0;
	
	var width = 0;
	var height = 0;
	var size = 0;
	var scale = false;
	var pixels = null;

	var div = null;
	var canvas = null;
	var ctx = null;
	var imagedata = null;
	var video = null;
	var open = false;
	
	/*---------------------------------*/

	//this.init = function()
	{
		var test = document.createElement('canvas');
		if (test && test.getContext) {
			var test2 = test.getContext('2d'); 
			if (test2) { 
 				this.available |= SAEI_Video_Canvas2D;
				test2 = null; 
			}
		}
		test = document.createElement('canvas');
		if (test && test.getContext) {
			test2 = test.getContext('experimental-webgl', glParams) || test.getContext('webgl', glParams);
			if (test2) {
	 			this.available |= SAEI_Video_WebGL;
				test2 = null; 
			}
			test = null; 
		}
 		//console.log(this.available);		
	}		
	
	/*---------------------------------*/

	function getShader(ctx, id) {
		var shader, source;

		if (id == 'vertex') {
			shader = ctx.createShader(ctx.VERTEX_SHADER);
			source = vertexShader;
		} else if (id == 'fragment') {
			shader = ctx.createShader(ctx.FRAGMENT_SHADER);
			source = fragmentShader;
		}
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);

		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS))
			Fatal(SAEE_Video_Shader_Error, ctx.getShaderInfoLog(shader));

		return shader;
	}

	function initGL() {
		var vertexShader = getShader(ctx, 'vertex');
		var fragmentShader = getShader(ctx, 'fragment');
		var program = ctx.createProgram();
		ctx.attachShader(program, vertexShader);
		ctx.attachShader(program, fragmentShader);
		ctx.linkProgram(program);
		if (!ctx.getProgramParameter(program, ctx.LINK_STATUS))
			Fatal(SAEE_Video_Shader_Error, 'Can\'t initialise the shaders for WebGL.');

		ctx.useProgram(program);

		var positionLocation = ctx.getAttribLocation(program, "a_position");
		var texCoordLocation = ctx.getAttribLocation(program, "a_texCoord");

		var texCoordBuffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, texCoordBuffer);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([
			0.0, 0.0,
			1.0, 0.0,
			0.0, 1.0,
			0.0, 1.0,
			1.0, 0.0,
			1.0, 1.0]), ctx.STATIC_DRAW);
		ctx.enableVertexAttribArray(texCoordLocation);
		ctx.vertexAttribPointer(texCoordLocation, 2, ctx.FLOAT, false, 0, 0);

		var texture = ctx.createTexture();
		ctx.bindTexture(ctx.TEXTURE_2D, texture);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);

		var resolutionLocation = ctx.getUniformLocation(program, "u_resolution");
		ctx.uniform2f(resolutionLocation, width, height);

		var buffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
		ctx.enableVertexAttribArray(positionLocation);
		ctx.vertexAttribPointer(positionLocation, 2, ctx.FLOAT, false, 0, 0);

		ctx.viewport(0, 0, width, height);
		ctx.clearColor(0, 0, 0, 1);
		ctx.clear(ctx.COLOR_BUFFER_BIT);
		ctx.colorMask(true, true, true, false);
	}
	
	this.setup = function () {
		if (!AMIGA.config.video.enabled) return;
		if (open) this.cleanup();

		div = document.getElementById(AMIGA.config.video.id);
		if (!div)
			Fatal(SAEE_Video_ID_Not_Found, 'Video DIV-element not found. Check your code. (Malformed-DIV-name: ' + AMIGA.config.video.id + ')');

		scale = (this.available & SAEI_Video_WebGL) ? AMIGA.config.video.scale : false;
		width = VIDEO_WIDTH << (scale ? 1 : 0);
		height = VIDEO_HEIGHT << (scale ? 1 : 0);
		size = width * height;
		//BUG.info('Video.init() %d x %d, %s mode', width, height, AMIGA.config.video.ntsc ? 'ntsc' : 'pal');

		if (this.available & SAEI_Video_Canvas2D) {
			canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			canvas.oncontextmenu = function () {
				return false;
			};
			if (AMIGA.config.ports[0].type == SAEV_Config_Ports_Type_Mouse) {
				canvas.onmousedown = function (e) {
					AMIGA.input.mouse.mousedown(e);
				};
				canvas.onmouseup = function (e) {
					AMIGA.input.mouse.mouseup(e);
				};
				canvas.onmouseover = function (e) {
					AMIGA.input.mouse.mouseover(e);
				};
				canvas.onmouseout = function (e) {
					AMIGA.input.mouse.mouseout(e);
				};
				canvas.onmousemove = function (e) {
					AMIGA.input.mouse.mousemove(e);
				}
			}
			if (this.available & SAEI_Video_WebGL) {
				ctx = canvas.getContext('experimental-webgl', glParams) || canvas.getContext('webgl', glParams);
				initGL();
				pixels = new Uint16Array(size);
				for (var i = 0; i < size; i++) pixels[i] = 0;

				//this.drawpixel = drawpixel_gl;
				this.drawline = drawline_gl;
				this.render = render_gl;
				this.show = show_gl;
			} else {
				ctx = canvas.getContext('2d');
				imagedata = ctx.createImageData(width, height);
				pixels = imagedata.data;

				//this.drawpixel = drawpixel_2d;
				this.drawline = drawline_2d;
				this.render = render_2d;
				this.show = show_2d;
			}
		} else {
			if (!confirm('Cant\'t initialise "WebGL" nor "Canvas 2D". Continue without video-playback?'))
				Fatal(SAEE_Video_Canvas_Not_Supported, null);
			else
				AMIGA.config.video.enabled = false;
		}

		video = document.createElement('div');
		video.style.width = width + 'px';
		video.style.height = height + 'px';
		video.style.margin = 'auto';
		video.style.webkitTouchCallout = 'none';
		video.style.webkitUserSelect = 'none';
		video.style.khtmlUserSelect = 'none';
		video.style.mozUserSelect = 'none';
		video.style.msUserSelect = 'none';
		video.style.userSelect = 'none';
		if (AMIGA.config.video.enabled)
			video.appendChild(canvas);

		div.appendChild(video);
		open = true;
	};

	this.cleanup = function () {
		if (open) {
			div.removeChild(video);
			canvas = null;
			imagedata = null;
			pixels = null;
			video = null;
			open = false;
		}
	};
	
	/*---------------------------------*/

	/*this.hideCursor = function (hide) {
		canvas.style.cursor = hide ? 'none' : 'auto';
	};*/
	
	/*this.clear_pixels = function () {
		for (var i = 0; i < size; i++) 
			pixels[i] = 0;
	}*/

	/*---------------------------------*/
	/* Canvas 2D */
	
	/*function drawpixel_2d(x, y, rgb) {
		pixels[y * width + x] = rgb;
	}*/
	
	function drawline_2d(y, data, offs) {
		var yoffs = (y * width) << 2;
		for (var x = 0, d = 0; x < width << 2; x += 4, d++) {
			pixels[yoffs + x    ] = ((data[offs + d] >> 8) & 0xf) << 4;
			pixels[yoffs + x + 1] = ((data[offs + d] >> 4) & 0xf) << 4;
			pixels[yoffs + x + 2] = ((data[offs + d] >> 0) & 0xf) << 4;
			pixels[yoffs + x + 3] = 255;
		}
	}
	
	function render_2d() {
		ctx.putImageData(imagedata, 0, 0);
	}
	
	function show_2d() {}	
	
	/*---------------------------------*/
	/* WebGL */
		
	/*function drawpixel_gl(x, y, rgb) {
		pixels[y * width + x] = rgb;
	}*/
	
	function drawline_gl(y, data, offs) {
		var yoffs = y * width;
		for (var x = 0; x < width; x++)
			pixels[yoffs + x] = data[offs + x] & 0xffff;
	}
	
	function render_gl() {
		ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGB, width, height, 0, ctx.RGB, ctx.UNSIGNED_SHORT_5_6_5, pixels);
				
		var x1 = 0;
		var x2 = width << (scale ? 1 : 0);
		var y1 = 0;
		var y2 = height << (scale ? 1 : 0);
		
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]), ctx.STATIC_DRAW);
	}
	
	function show_gl() {
		ctx.drawArrays(ctx.TRIANGLES, 0, 6);
	}	
}

