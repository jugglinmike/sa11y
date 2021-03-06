'use strict';
/**
 * The Node.js EventEmitter class.
 *
 * @external EventEmitter
 * @see {@link https://nodejs.org/dist/latest-v10.x/docs/api/events.html#events_class_eventemitter}
 */
const EventEmitter = require('events');

const {Builder, By, Key} = require('selenium-webdriver');

const AriaDriverError = require('./error');

const defaults = {
  url: undefined,
  patience: 1000
};

/**
 * An interface for interacting with a web page using the design patterns and
 * widgets defined in the WAI-ARIA Authoring Practices Guide.
 *
 * @see {@link https://www.w3.org/TR/wai-aria-practices-1.1/}
 * @extends external:EventEmitter
 *
 * @param {object} [options]
 * @param {string} [options.url] - location of a running WebDriver server
 * @param {number} [options.patience] - number of milliseconds to wait for
 *                                      expected UI events before reporting a
 *                                      timeout error (default: 1000).
 */
class AriaDriver extends EventEmitter {
  constructor(options) {
    super();

    options = Object.assign({}, defaults, options);

    this._patience = options.patience;

    this._driver = new Builder()
      .forBrowser('firefox')
      .usingServer(options.url)
      .build();
  }

  /**
   * The number of milliseconds to wait for expected UI events before reporting
   * a timeout error. Set during object construction.
   *
   * @type number
   * @readonly
   */
  get patience() {
    return this._patience;
  }

  async getSessionId() {
    const session = await this._driver.getSession();
    return session.getId();
  }

  /**
   * {@link https://html.spec.whatwg.org/#navigate Navigate} the {@link
   * https://w3c.github.io/webdriver/#dfn-current-top-level-browsing-context
   * current top-level browsing context} to a new location.
   *
   * @param {string} url - the desired location
   *
   * @see {@link https://w3c.github.io/webdriver/#navigate-to}
   */
  get(url) {
    return this._driver.get(url);
  }

  async count(selector) {
    return (await this._driver.findElements(By.css(selector))).length;
  }

  async _findOne(selector) {
    const targets = await this._driver.findElements(By.css(selector));

    if (targets.length === 0) {
      throw new AriaDriverError('ARIADRIVER-ELEMENT-NOT-FOUND', [selector]);
    }

    if (targets.length > 1) {
      this.emit('warning', new AriaDriverError('ARIADRIVER-AMBIGUOUS-REFERENCE', [selector]));
    }

    const tabIndex = await targets[0].getAttribute('tabindex');
    if (parseInt(tabIndex, 10) > 0) {
      this.emit('warning', new AriaDriverError(
        'ARIADRIVER-POOR-SEMANTICS',
        null,
        `The tabindex property is set to ${tabIndex}, but it should not exceed 0.`,
        'https://www.w3.org/TR/wai-aria-practices-1.1/#kbd_general_between'
      ));
    }

    return targets[0];
  }

  /**
   * Use the specified element: bring the element into focus and press the
   * "enter" key.
   *
   * @param {string} selector - CSS selector describing an element on the page
   *
   * @throws When the `aria-hidden` attribute of the target element is set to
   *         `true`
   * @throws When the target element is not reported as the document's {@link
   *         https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement
   *         activeElement} following interaction.
   */
  async use(selector) {
    await this._use(selector, await this._findOne(selector));
  }

  async _use(selector, target) {
    // UAs that are not screen readers may accept focus on elements that bear
    // the `aria-hidden` attribute but which are visually rendered. This makes
    // an explicit verification necessary.
    if (await target.getAttribute('aria-hidden') === 'true') {
      throw new AriaDriverError('ARIADRIVER-ELEMENT-UNFOCUSABLE', [selector]);
    }

    /* istanbul ignore next */
    const accepted = await this._driver.executeScript(function() {
      // jshint browser: true
      arguments[0].focus();
      return document.activeElement === arguments[0];
    }, target);

    if (!accepted) {
      throw new AriaDriverError('ARIADRIVER-ELEMENT-UNFOCUSABLE', [selector]);
    }

    await target.sendKeys(Key.ENTER);
  }

  /**
   * Terminates the browser session. After calling quit, this instance will be
   * invalidated and may no longer be used to issue commands against the
   * browser.
   */
  quit() {
    return this._driver.quit();
  }
}

Object.assign(AriaDriver.prototype, require('./widgets/button'));
Object.assign(AriaDriver.prototype, require('./widgets/dialog'));
Object.assign(AriaDriver.prototype, require('./widgets/popup'));

module.exports = AriaDriver;
