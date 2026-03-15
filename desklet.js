const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gdk = imports.gi.Gdk;
const Clutter = imports.gi.Clutter;
const Cairo = imports.cairo;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

const POKEMON_SPRITE_DIR =
	imports.ui.deskletManager.deskletMeta["pokemon@desklet"].path + "/pokemon/";
const TRAINER_SPRITE_DIR =
	imports.ui.deskletManager.deskletMeta["pokemon@desklet"].path +
	"/trainers/";
const DESKLET_SIZE = 480;
const SPRITE_SCALE = 3;
const FRAME_INTERVAL_MS = 100;
const MAX_FRAMES = 4096;

class PokemonDesklet extends Desklet.Desklet {
	constructor(metadata, deskletId) {
		super(metadata, deskletId);

		this._settings = new Settings.DeskletSettings(
			this,
			"pokemon@desklet",
			deskletId,
		);
		this._settings.bindProperty(
			Settings.BindingDirection.IN,
			"pinned",
			"_pinned",
			null,
			null,
		);
		this._settings.bindProperty(
			Settings.BindingDirection.IN,
			"use-trainers",
			"_useTrainers",
			null,
			null,
		);
		this._settings.bindProperty(
			Settings.BindingDirection.IN,
			"flip-horizontal",
			"_flipHorizontal",
			null,
			null,
		);

		this._animation = null;
		this._forwardAnimation = null;
		this._reverseAnimation = null;
		this._iter = null;
		this._currentPath = null;
		this._isReverse = false;
		this._frameCount = 0;
		this._currentFrame = 0;

		this._buildUI();
		this._loadRandomSprite();
	}

	_buildUI() {
		this._canvas = new Clutter.Canvas();
		this._canvas.set_size(DESKLET_SIZE, DESKLET_SIZE);
		this._canvas.connect("draw", (canvas, cr, w, h) => this._onDraw(cr));

		this._actor = new Clutter.Actor();
		this._actor.set_size(DESKLET_SIZE, DESKLET_SIZE);
		this._actor.set_content(this._canvas);

		const container = new St.Bin();
		container.set_size(DESKLET_SIZE, DESKLET_SIZE);
		container.set_child(this._actor);
		this.setContent(container);
	}

	_fileExists(path) {
		return Gio.File.new_for_path(path).query_exists(null);
	}

	_resolveTrainerPath() {
		if (this._pinned && this._pinned.trim() !== "") {
			const path = TRAINER_SPRITE_DIR + this._pinned.trim();
			return this._fileExists(path) ? path : null;
		}

		const dir = Gio.File.new_for_path(TRAINER_SPRITE_DIR);
		const enumerator = dir.enumerate_children(
			"standard::name",
			Gio.FileQueryInfoFlags.NONE,
			null,
		);

		const files = [];
		let info;
		while ((info = enumerator.next_file(null)) !== null) {
			const name = info.get_name();
			if (name.endsWith(".gif") && !name.endsWith("_R.gif")) {
				files.push(name);
			}
		}
		enumerator.close(null);

		if (files.length === 0) return null;

		return (
			TRAINER_SPRITE_DIR + files[Math.floor(Math.random() * files.length)]
		);
	}

	_resolveSpritePath() {
		if (this._useTrainers) {
			return this._resolveTrainerPath();
		}

		if (this._pinned && this._pinned.trim() !== "") {
			const path = POKEMON_SPRITE_DIR + this._pinned.trim();
			return this._fileExists(path) ? path : null;
		}

		const id = Math.floor(Math.random() * 649) + 1;
		const base = id * 32;

		for (var attempt = 0; attempt < 32; attempt++) {
			var form = Math.floor(Math.random() * 32);
			var candidateForm =
				POKEMON_SPRITE_DIR + "s" + (base + form) + ".gif";

			if (this._fileExists(candidateForm)) {
				var shiny = Math.floor(Math.random() * 128) === 0;
				if (shiny) {
					var shinyCandidate =
						POKEMON_SPRITE_DIR + "s" + (base + form) + "-s.gif";
					return this._fileExists(shinyCandidate)
						? shinyCandidate
						: candidateForm;
				}
				return candidateForm;
			}
		}

		return POKEMON_SPRITE_DIR + "s" + base + ".gif";
	}

	_countFrames(path) {
		try {
			const jsonPath = TRAINER_SPRITE_DIR + "frame_counts.json";
			const file = Gio.File.new_for_path(jsonPath);
			const [, contents] = file.load_contents(null);
			const counts = JSON.parse(new TextDecoder().decode(contents));
			const fileName = path.split("/").pop();
			return counts[fileName] || MAX_FRAMES;
		} catch (e) {
			global.logError(
				"pokemon@desklet: failed to read frame_counts.json: " + e,
			);
			return MAX_FRAMES;
		}
	}

	_loadSprite(path) {
		this._stopAnimation();
		try {
			if (this._useTrainers) {
				if (
					this._forwardAnimation != null &&
					this._reverseAnimation != null
				) {
					this._animation = this._isReverse
						? this._reverseAnimation
						: this._forwardAnimation;
				} else {
					this._forwardAnimation =
						GdkPixbuf.PixbufAnimation.new_from_file(path);
					const reversePath = path.replace(".gif", "_R.gif");
					this._reverseAnimation =
						GdkPixbuf.PixbufAnimation.new_from_file(reversePath);
					this._animation = this._forwardAnimation;
				}
			} else {
				this._animation = GdkPixbuf.PixbufAnimation.new_from_file(path);
			}

			this._iter = this._animation.get_iter(null);
			this._frameCount = this._countFrames(path);
			this._currentFrame = 1;

			const firstFrame = this._iter.get_pixbuf();
			this._spriteWidth = firstFrame.get_width() * SPRITE_SCALE;
			this._spriteHeight = firstFrame.get_height() * SPRITE_SCALE;

			this._startAnimation();
		} catch (e) {
			global.logError("pokemon@desklet: failed to load sprite: " + e);
		}
	}

	_loadRandomSprite() {
		this._animation = null;
		this._forwardAnimation = null;
		this._reverseAnimation = null;
		this._currentPath = this._useTrainers
			? this._resolveTrainerPath()
			: this._resolveSpritePath();
		this._isReverse = false;

		if (this._currentPath === null) {
			global.logError(
				"pokemon@desklet: could not resolve a valid sprite path",
			);
			return;
		}

		this._loadSprite(this._currentPath);
	}

	_startAnimation() {
		const delay = this._iter.get_delay_time();
		const firstDelay = delay > 0 ? delay : FRAME_INTERVAL_MS;
		this._timeoutId = Mainloop.timeout_add(firstDelay, () => this._tick());
	}

	_stopAnimation() {
		if (this._timeoutId !== null) {
			Mainloop.source_remove(this._timeoutId);
			this._timeoutId = null;
		}
		this._iter = null;
		this._animation = null;
	}

	_tick() {
		if (this._iter === null) return false;

		this._iter.advance(null);
		this._currentFrame++;

		if (
			(this._useTrainers &&
				this._isReverse &&
				this._currentFrame >= this._frameCount) ||
			(this._useTrainers &&
				!this._isReverse &&
				this._currentFrame > this._frameCount)
		) {
			this._isReverse = !this._isReverse;
			this._loadSprite(this._currentPath);
			return false;
		}

		this._canvas.invalidate();

		const delay = this._iter.get_delay_time();
		const nextDelay = delay > 0 ? delay : FRAME_INTERVAL_MS;
		this._timeoutId = Mainloop.timeout_add(nextDelay, () => this._tick());
		return false;
	}

	_onDraw(cr) {
		if (this._iter === null) return;

		const pixbuf = this._iter.get_pixbuf();
		if (pixbuf === null) return;

		const scaled = pixbuf.scale_simple(
			this._spriteWidth,
			this._spriteHeight,
			GdkPixbuf.InterpType.NEAREST,
		);

		const xOffset = Math.floor((DESKLET_SIZE - this._spriteWidth) / 2);
		const yOffset = DESKLET_SIZE - this._spriteHeight;

		cr.save();
		cr.setOperator(Cairo.Operator.CLEAR);
		cr.paint();
		cr.setOperator(Cairo.Operator.OVER);
		if (this._flipHorizontal) {
			cr.translate(xOffset + this._spriteWidth, yOffset);
			cr.scale(-1, 1);
			Gdk.cairo_set_source_pixbuf(cr, scaled, 0, 0);
		} else {
			Gdk.cairo_set_source_pixbuf(cr, scaled, xOffset, yOffset);
		}
		cr.paint();
		cr.restore();
	}

	on_desklet_clicked() {
		this._loadRandomSprite();
	}

	on_desklet_removed() {
		this._stopAnimation();
	}
}

function main(metadata, deskletId) {
	return new PokemonDesklet(metadata, deskletId);
}
